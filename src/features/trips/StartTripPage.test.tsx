import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartTripPage, type StartTripPageClient } from './StartTripPage'
import type { Trip, TripCollaboration } from './types'
import type { TripOfflineGrantSource, TripOfflineRuntime } from './tripRuntime'

afterEach(cleanup)

const readyTrip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-10-08',
  state: 'ready',
  version: 4,
  stops: [],
}
const activeTrip: Trip = { ...readyTrip, state: 'active', version: 5 }

function collaboration(navigatorUserId?: string): TripCollaboration {
  return {
    tripId: readyTrip.id,
    tripVersion: readyTrip.version,
    currentUserId: 'creator-a',
    participants: [
      { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' },
      { userId: 'partner-b', displayName: 'Trip partner', role: 'partner' },
    ],
    navigatorUserId,
  }
}

function client(overrides: Partial<StartTripPageClient> = {}): StartTripPageClient {
  return {
    get: vi.fn(async () => readyTrip),
    getCollaboration: vi.fn(async () => collaboration()),
    start: vi.fn(async () => activeTrip),
    prepareInitialNavigator: vi.fn(async () => ({
      ...collaboration('creator-a'),
      tripVersion: readyTrip.version + 1,
    })),
    verifyInitialNavigatorDevice: vi.fn(async () => ({
      tripVersion: readyTrip.version + 1,
      currentDeviceBound: true,
    })),
    confirmCurrentNavigatorDevice: vi.fn(async () => activeTrip.version),
    ...overrides,
  }
}

function renderPage(
  api: StartTripPageClient,
  options: {
    offlineRuntime?: TripOfflineRuntime
    offlineGrantSource?: TripOfflineGrantSource
    onStarted?: ReturnType<typeof vi.fn>
  } = {},
) {
  const onStarted = options.onStarted ?? vi.fn()
  render(
    <StartTripPage
      tripId={readyTrip.id}
      client={api}
      onStarted={onStarted}
      offlineRuntime={options.offlineRuntime}
      offlineGrantSource={options.offlineGrantSource}
      accountId={options.offlineRuntime ? 'account-a' : undefined}
    />,
  )
  return onStarted
}

function startOfflineRuntime(start: ReturnType<typeof vi.fn>): TripOfflineRuntime {
  return {
    installId: 'install-a',
    deviceKeyId: 'device-key-a',
    start,
    recover: vi.fn(),
    prepareSignOut: vi.fn(),
    purgeAccount: vi.fn(),
  } as unknown as TripOfflineRuntime
}

describe('StartTripPage', () => {
  it('cancels before dispatch without mutating trip or device state', async () => {
    const user = userEvent.setup()
    const api = client()
    renderPage(api)

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.prepareInitialNavigator).not.toHaveBeenCalled()
    expect(api.verifyInitialNavigatorDevice).not.toHaveBeenCalled()
    expect(api.start).not.toHaveBeenCalled()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.getCollaboration).toHaveBeenCalledTimes(1)
  })

  it('preserves configured grant and queue handoff on successful Start', async () => {
    const user = userEvent.setup()
    const api = client()
    const runtimeStart = vi.fn(async () => activeTrip)
    const source = {} as TripOfflineGrantSource
    const onStarted = renderPage(api, {
      offlineRuntime: startOfflineRuntime(runtimeStart),
      offlineGrantSource: source,
    })

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(api.prepareInitialNavigator).toHaveBeenCalledWith(readyTrip.id, readyTrip.version)
    expect(api.verifyInitialNavigatorDevice).toHaveBeenCalledWith(readyTrip.id)
    expect(runtimeStart).toHaveBeenCalledWith('account-a', readyTrip.id, source)
    expect(api.start).not.toHaveBeenCalled()
    expect(onStarted).toHaveBeenCalledWith(activeTrip, { offlineReady: true })
  })

  it('does not mutate when another Navigator wins before confirmation', async () => {
    const user = userEvent.setup()
    const api = client({
      getCollaboration: vi
        .fn()
        .mockResolvedValueOnce(collaboration())
        .mockResolvedValueOnce(collaboration('partner-b')),
    })
    renderPage(api)

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/another Navigator is assigned/i)
    expect(api.prepareInitialNavigator).not.toHaveBeenCalled()
    expect(api.verifyInitialNavigatorDevice).not.toHaveBeenCalled()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('recovers a lost initial-assignment response by verifying the same device', async () => {
    const user = userEvent.setup()
    const initial = collaboration()
    const assigned = collaboration('creator-a')
    const api = client({
      get: vi.fn().mockResolvedValue(readyTrip),
      getCollaboration: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce({ ...assigned, tripVersion: readyTrip.version + 1 }),
      prepareInitialNavigator: vi.fn().mockRejectedValueOnce(new Error('response lost')),
    })
    const runtimeStart = vi.fn(async () => activeTrip)
    const onStarted = renderPage(api, {
      offlineRuntime: startOfflineRuntime(runtimeStart),
      offlineGrantSource: {} as TripOfflineGrantSource,
    })

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(api.prepareInitialNavigator).toHaveBeenCalledTimes(1)
    expect(api.verifyInitialNavigatorDevice).toHaveBeenCalledTimes(2)
    expect(runtimeStart).toHaveBeenCalledTimes(1)
    expect(onStarted).toHaveBeenCalledWith(activeTrip, { offlineReady: true })
  })

  it('uses read-only Go proof after a lost Start response without replay or offline claim', async () => {
    const user = userEvent.setup()
    const assigned = collaboration('creator-a')
    const api = client({
      get: vi
        .fn()
        .mockResolvedValueOnce(readyTrip)
        .mockResolvedValueOnce(readyTrip)
        .mockResolvedValueOnce(activeTrip)
        .mockResolvedValueOnce(activeTrip),
      getCollaboration: vi
        .fn()
        .mockResolvedValueOnce(assigned)
        .mockResolvedValueOnce(assigned)
        .mockResolvedValueOnce({ ...assigned, tripVersion: activeTrip.version }),
      verifyInitialNavigatorDevice: vi.fn(async () => ({
        tripVersion: readyTrip.version,
        currentDeviceBound: true,
      })),
      prepareInitialNavigator: vi.fn(),
    })
    const runtimeStart = vi.fn().mockRejectedValueOnce(new Error('response lost'))
    const onStarted = renderPage(api, {
      offlineRuntime: startOfflineRuntime(runtimeStart),
      offlineGrantSource: {} as TripOfflineGrantSource,
    })

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(runtimeStart).toHaveBeenCalledTimes(1)
    expect(api.start).not.toHaveBeenCalled()
    expect(api.confirmCurrentNavigatorDevice).toHaveBeenCalledWith(readyTrip.id)
    expect(onStarted).toHaveBeenCalledWith(activeTrip, { offlineReady: false })
  })

  it('does not continue or offer retry when current-device proof fails after Start', async () => {
    const user = userEvent.setup()
    const assigned = collaboration('creator-a')
    const api = client({
      get: vi
        .fn()
        .mockResolvedValueOnce(readyTrip)
        .mockResolvedValueOnce(readyTrip)
        .mockResolvedValueOnce(activeTrip),
      getCollaboration: vi
        .fn()
        .mockResolvedValueOnce(assigned)
        .mockResolvedValueOnce(assigned)
        .mockResolvedValueOnce({ ...assigned, tripVersion: activeTrip.version }),
      verifyInitialNavigatorDevice: vi.fn(async () => ({
        tripVersion: readyTrip.version,
        currentDeviceBound: true,
      })),
      confirmCurrentNavigatorDevice: vi.fn().mockRejectedValueOnce(new Error('not allowed')),
      prepareInitialNavigator: vi.fn(),
    })
    const runtimeStart = vi.fn().mockRejectedValueOnce(new Error('response lost'))
    const onStarted = renderPage(api, {
      offlineRuntime: startOfflineRuntime(runtimeStart),
      offlineGrantSource: {} as TripOfflineGrantSource,
    })

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(runtimeStart).toHaveBeenCalledTimes(1)
    expect(api.confirmCurrentNavigatorDevice).toHaveBeenCalledWith(readyTrip.id)
    expect(onStarted).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/device could not be confirmed/i)
    expect(screen.queryByRole('button', { name: 'Review and retry' })).not.toBeInTheDocument()
  })

  it('stops when the assigned Navigator device does not match this device', async () => {
    const user = userEvent.setup()
    const api = client({
      verifyInitialNavigatorDevice: vi.fn(async () => ({
        tripVersion: readyTrip.version,
        currentDeviceBound: false,
      })),
    })
    const onStarted = renderPage(api)

    await user.click(await screen.findByRole('button', { name: 'Start outing' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and start' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/device could not be confirmed/i)
    expect(api.start).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('does not offer Start to a different account when no Navigator is assigned', async () => {
    const api = client({
      getCollaboration: vi.fn(async () => ({
        ...collaboration(),
        currentUserId: 'partner-b',
      })),
    })
    renderPage(api)

    expect(
      await screen.findByText(/only the trip creator can assign the initial Navigator/i),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Start outing' })).not.toBeInTheDocument()
  })
})
