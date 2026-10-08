import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthoritativeCheckMyDayPage, CheckMyDayPage } from './CheckMyDayPage'
import type { CheckMyDayProvider, CheckMyDayRequest } from './checkMyDay'
import type { CheckMyDayServerResult, Trip } from '../trips'

const request: CheckMyDayRequest = {
  capability: 'available',
  providerContract: { version: 'fixture-v1', maxRequests: 1, maxCostUnits: 5, timeoutMs: 100 },
  origin: { latitude: 39.04, longitude: -95.67 },
  departureMinute: 540,
  transitionMinutes: 10,
  stops: [
    {
      id: 'oak',
      name: 'Oak Antiques',
      coordinate: { latitude: 39.05, longitude: -95.68 },
      kind: 'store',
      priority: 'must',
      dwellMinutes: 45,
      originalIndex: 0,
      hours: { state: 'verified', opensAt: 540, closesAt: 1_020 },
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const currentTrip: Trip = {
  id: 'trip-1',
  name: 'Synthetic trip',
  localDate: '2026-08-03',
  state: 'draft',
  version: 4,
  stops: [
    {
      id: 'oak',
      kind: 'store',
      label: 'Oak Antiques',
      position: 0,
      priority: 'must',
      plannedDwellMinutes: 30,
      state: 'planned',
    },
  ],
}

describe('Check My Day page', () => {
  afterEach(cleanup)

  it('waits for explicit action and exposes accessible Use Suggested/Keep My Order choices', async () => {
    const user = userEvent.setup()
    const provider: CheckMyDayProvider = {
      getCoordinateMatrix: vi.fn(async () => ({
        status: 'ok' as const,
        providerVersion: 'fixture-v1',
        attribution: 'Synthetic fixture',
        generatedAt: '2026-08-03T12:00:00Z',
        requestCount: 1,
        costUnits: 1,
        legs: [{ fromIndex: 0, toIndex: 1, miles: 5, minutes: 20 }],
      })),
    }
    const useSuggested = vi.fn()
    render(
      <CheckMyDayPage request={request} provider={provider} onUseSuggestedOrder={useSuggested} />,
    )
    expect(provider.getCoordinateMatrix).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('heading', { name: /suggested order/i })).toBeInTheDocument()
    expect(screen.getAllByText(/not a claim of real-world optimality/i)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /use suggested order/i }))
    await user.click(screen.getByRole('button', { name: /keep my order/i }))
    expect(useSuggested).toHaveBeenCalledWith(['oak'])
    expect(useSuggested).toHaveBeenCalledTimes(1)
  })

  it('keeps the route provider-blocked when no approved request exists', () => {
    const provider: CheckMyDayProvider = { getCoordinateMatrix: vi.fn() }
    render(<CheckMyDayPage request={null} provider={provider} />)
    expect(screen.getByRole('status')).toHaveTextContent(/not available yet/i)
    expect(screen.queryByRole('button', { name: /^check my day$/i })).not.toBeInTheDocument()
    expect(provider.getCoordinateMatrix).not.toHaveBeenCalled()
  })

  it('requests and polls only the authoritative server boundary', async () => {
    const user = userEvent.setup()
    const requestServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'ready' as const,
      tripVersion: 4,
    }))
    const pollServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
      orderedStopIds: ['oak'],
      explanation: ['Fits the approved route evidence.'],
    }))
    const apply = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => ({
          id: 'trip-1',
          name: 'Synthetic trip',
          localDate: '2026-08-03',
          state: 'draft',
          version: 4,
          stops: [
            {
              id: 'oak',
              kind: 'store',
              label: 'Oak Antiques',
              position: 0,
              priority: 'must',
              plannedDwellMinutes: 30,
              state: 'planned',
            },
          ],
        })}
        requestServer={requestServer}
        pollServer={pollServer}
        onUseSuggestedOrder={apply}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(requestServer).toHaveBeenCalledOnce()
    expect(pollServer).toHaveBeenCalledWith('request-1')
    expect(await screen.findByText(/fits the approved route evidence/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /use suggested order/i }))
    expect(apply).toHaveBeenCalledWith('request-1', 4)
  })

  it('retries a failed trip read without creating another Check request or applying Use', async () => {
    const user = userEvent.setup()
    const requestServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
      orderedStopIds: ['oak'],
      explanation: ['Fits the approved route evidence.'],
    }))
    const pollServer = vi.fn()
    const loadTrip = vi
      .fn()
      .mockRejectedValueOnce(new Error('initial trip read failed'))
      .mockResolvedValueOnce(currentTrip)
    const use = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={loadTrip}
        requestServer={requestServer}
        pollServer={pollServer}
        onUseSuggestedOrder={use}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByText(/the trip could not be refreshed/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry trip refresh/i }))

    expect(await screen.findByText(/fits the approved route evidence/i)).toBeInTheDocument()
    expect(requestServer).toHaveBeenCalledOnce()
    expect(pollServer).not.toHaveBeenCalled()
    expect(loadTrip).toHaveBeenCalledTimes(2)
    expect(use).not.toHaveBeenCalled()
  })

  it('refreshes the trip after an uncertain Use without another Check or Use write', async () => {
    const user = userEvent.setup()
    const refreshedTrip: Trip = {
      ...currentTrip,
      version: 5,
      stops: [
        {
          id: 'maple',
          kind: 'rest',
          label: 'Maple stop',
          position: 0,
          priority: 'flexible',
          plannedDwellMinutes: 15,
          state: 'planned',
        },
        { ...currentTrip.stops[0]!, position: 1 },
      ],
    }
    const requestServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
      orderedStopIds: ['oak'],
      explanation: ['Synthetic suggestion'],
    }))
    const pollServer = vi.fn()
    const loadTrip = vi.fn().mockResolvedValueOnce(currentTrip).mockResolvedValueOnce(refreshedTrip)
    const use = vi.fn(async () => {
      throw new Error('uncertain result')
    })
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={loadTrip}
        requestServer={requestServer}
        pollServer={pollServer}
        onUseSuggestedOrder={use}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await screen.findByRole('button', { name: /use suggested order/i })
    await user.click(screen.getByRole('button', { name: /use suggested order/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not confirm whether the suggestion was applied/i,
    )
    await user.click(screen.getByRole('button', { name: /^refresh trip$/i }))

    expect(await screen.findByRole('heading', { name: /current trip order/i })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /current saved trip order/i })).toHaveTextContent(
      'Maple stopOak Antiques',
    )
    expect(requestServer).toHaveBeenCalledOnce()
    expect(pollServer).not.toHaveBeenCalled()
    expect(use).toHaveBeenCalledOnce()
    expect(loadTrip).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: /use suggested order/i })).not.toBeInTheDocument()
  })

  it('keeps refresh retry available when the trip reread fails without another Check or Use write', async () => {
    const user = userEvent.setup()
    const requestServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
      orderedStopIds: ['oak'],
    }))
    const pollServer = vi.fn()
    const loadTrip = vi
      .fn()
      .mockResolvedValueOnce(currentTrip)
      .mockRejectedValueOnce(new Error('read failed'))
    const use = vi.fn(async () => {
      throw new Error('uncertain result')
    })
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={loadTrip}
        requestServer={requestServer}
        pollServer={pollServer}
        onUseSuggestedOrder={use}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await user.click(await screen.findByRole('button', { name: /use suggested order/i }))
    await user.click(await screen.findByRole('button', { name: /^refresh trip$/i }))

    expect(await screen.findByText(/trip refresh failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry trip refresh/i })).toBeInTheDocument()
    expect(requestServer).toHaveBeenCalledOnce()
    expect(pollServer).not.toHaveBeenCalled()
    expect(use).toHaveBeenCalledOnce()
    expect(loadTrip).toHaveBeenCalledTimes(2)
  })

  it('ignores a trip read that settles after the user stops waiting', async () => {
    const user = userEvent.setup()
    const lateTrip = deferred<Trip | null>()
    const requestServer = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
      orderedStopIds: ['oak'],
      explanation: ['Late suggestion'],
    }))
    const pollServer = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={() => lateTrip.promise}
        requestServer={requestServer}
        pollServer={pollServer}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await user.click(await screen.findByRole('button', { name: /stop waiting/i }))
    await act(async () => lateTrip.resolve(currentTrip))

    expect(screen.queryByText('Late suggestion')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /server request or trip read may still finish/i,
    )
    expect(pollServer).not.toHaveBeenCalled()
  })

  it('ignores a request result that settles after the user stops waiting', async () => {
    const user = userEvent.setup()
    const lateRequest = deferred<CheckMyDayServerResult>()
    const requestServer = vi.fn(() => lateRequest.promise)
    const pollServer = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => currentTrip}
        requestServer={requestServer}
        pollServer={pollServer}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await user.click(screen.getByRole('button', { name: /stop waiting/i }))
    expect(screen.getByRole('status')).toHaveTextContent(
      /server request or trip read may still finish/i,
    )

    await act(async () => {
      lateRequest.resolve({
        requestId: 'late-request',
        state: 'suggested',
        tripVersion: 4,
        orderedStopIds: ['oak'],
        explanation: ['Late suggestion'],
      })
    })

    expect(pollServer).not.toHaveBeenCalled()
    expect(screen.queryByText('Late suggestion')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /server request or trip read may still finish/i,
    )
  })

  it('keeps a retry result when an earlier poll settles late after cancellation', async () => {
    const user = userEvent.setup()
    const latePoll = deferred<CheckMyDayServerResult>()
    const requestResults: CheckMyDayServerResult[] = [
      { requestId: 'old-request', state: 'ready', tripVersion: 4 },
      {
        requestId: 'new-request',
        state: 'suggested',
        tripVersion: 4,
        orderedStopIds: ['oak'],
        explanation: ['Current retry suggestion'],
      },
    ]
    const requestServer = vi.fn(async () => requestResults.shift()!)
    const pollServer = vi.fn(() => latePoll.promise)
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => currentTrip}
        requestServer={requestServer}
        pollServer={pollServer}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await waitFor(() => expect(pollServer).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: /stop waiting/i }))
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByText('Current retry suggestion')).toBeInTheDocument()

    await act(async () => {
      latePoll.resolve({
        requestId: 'old-request',
        state: 'suggested',
        tripVersion: 4,
        orderedStopIds: ['oak'],
        explanation: ['Late old suggestion'],
      })
    })

    expect(screen.getByText('Current retry suggestion')).toBeInTheDocument()
    expect(screen.queryByText('Late old suggestion')).not.toBeInTheDocument()
  })
})
