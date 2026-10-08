import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthoritativeCheckMyDayPage } from './CheckMyDayPage'
import type { Trip } from '../trips'

const trip: Trip = {
  id: 'trip-1',
  name: 'Weekend trail',
  localDate: '2026-09-07',
  state: 'draft',
  version: 3,
  stops: [
    {
      id: 'a',
      kind: 'store',
      label: 'Alpha Antiques',
      position: 0,
      priority: 'must',
      plannedDwellMinutes: 30,
      state: 'planned',
    },
    {
      id: 'b',
      kind: 'store',
      label: 'Blue Finch Curios',
      position: 1,
      priority: 'prefer',
      plannedDwellMinutes: 30,
      state: 'planned',
    },
    {
      id: 'c',
      kind: 'store',
      label: 'Cedar House',
      position: 2,
      priority: 'flexible',
      plannedDwellMinutes: 30,
      state: 'planned',
    },
  ],
}

describe('authoritative suggested order', () => {
  afterEach(cleanup)

  it('renders server order as named stops before enabling a choice', async () => {
    const user = userEvent.setup()
    const apply = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        onUseSuggestedOrder={apply}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('list', { name: /suggested stop order/i })).toHaveTextContent(
      'Cedar HouseAlpha AntiquesBlue Finch Curios',
    )
    await user.click(screen.getByRole('button', { name: /use suggested order/i }))
    expect(apply).toHaveBeenCalledWith('r1', 3)
  })

  it('rejects incomplete server order without offering a false choice', async () => {
    const user = userEvent.setup()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a'],
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/stale or incomplete/i)
    expect(screen.queryByRole('button', { name: /use suggested order/i })).not.toBeInTheDocument()
  })

  it('denies Use when the refreshed trip revision differs from the request snapshot', async () => {
    const user = userEvent.setup()
    const apply = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => ({ ...trip, version: 4 })}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        onUseSuggestedOrder={apply}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/stale or incomplete/i)
    expect(screen.queryByRole('button', { name: /use suggested order/i })).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('rejects a poll response bound to another request or trip revision', async () => {
    const user = userEvent.setup()
    const apply = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({ requestId: 'r1', state: 'ready', tripVersion: 3 })}
        pollServer={async () => ({
          requestId: 'r2',
          state: 'suggested',
          tripVersion: 4,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        onUseSuggestedOrder={apply}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/trip changed/i)
    expect(screen.queryByRole('button', { name: /use suggested order/i })).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('keeps the saved order without invoking the write callback', async () => {
    const user = userEvent.setup()
    const write = vi.fn()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        onUseSuggestedOrder={write}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await user.click(await screen.findByRole('button', { name: /keep my order/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/manual order remains unchanged/i)
    expect(write).not.toHaveBeenCalled()
  })

  it('reports an uncertain Use result without claiming the order stayed unchanged', async () => {
    const user = userEvent.setup()
    const use = vi.fn(async () => {
      throw new Error('trip changed')
    })
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          tripVersion: 3,
          orderedStopIds: ['c', 'a', 'b'],
        })}
        onUseSuggestedOrder={use}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    await user.click(await screen.findByRole('button', { name: /use suggested order/i }))

    expect(use).toHaveBeenCalledWith('r1', 3)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not confirm whether the suggestion was applied/i,
    )
    expect(screen.getByRole('button', { name: /use suggested order/i })).toBeDisabled()
  })
})
