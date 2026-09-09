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
          orderedStopIds: ['c', 'a', 'b'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
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
    expect(apply).toHaveBeenCalledWith(['c', 'a', 'b'])
  })

  it('rejects incomplete server order without offering a false choice', async () => {
    const user = userEvent.setup()
    render(
      <AuthoritativeCheckMyDayPage
        loadTrip={async () => trip}
        requestServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          orderedStopIds: ['c', 'a'],
        })}
        pollServer={async () => ({
          requestId: 'r1',
          state: 'suggested',
          orderedStopIds: ['c', 'a'],
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/stale or incomplete/i)
    expect(screen.queryByRole('button', { name: /use suggested order/i })).not.toBeInTheDocument()
  })
})
