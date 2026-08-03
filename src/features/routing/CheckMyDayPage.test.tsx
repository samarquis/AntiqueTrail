import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckMyDayPage } from './CheckMyDayPage'
import type { CheckMyDayProvider, CheckMyDayRequest } from './checkMyDay'

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
    const keepOrder = vi.fn()
    render(
      <CheckMyDayPage
        request={request}
        provider={provider}
        onUseSuggestedOrder={useSuggested}
        onKeepMyOrder={keepOrder}
      />,
    )
    expect(provider.getCoordinateMatrix).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^check my day$/i }))
    expect(await screen.findByRole('heading', { name: /suggested order/i })).toBeInTheDocument()
    expect(screen.getAllByText(/not a claim of real-world optimality/i)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /use suggested order/i }))
    await user.click(screen.getByRole('button', { name: /keep my order/i }))
    expect(useSuggested).toHaveBeenCalledWith(['oak'])
    expect(keepOrder).toHaveBeenCalledWith(['oak'])
  })

  it('keeps the route provider-blocked when no approved request exists', () => {
    const provider: CheckMyDayProvider = { getCoordinateMatrix: vi.fn() }
    render(<CheckMyDayPage request={null} provider={provider} />)
    expect(screen.getByRole('status')).toHaveTextContent(/not available yet/i)
    expect(screen.queryByRole('button', { name: /^check my day$/i })).not.toBeInTheDocument()
    expect(provider.getCoordinateMatrix).not.toHaveBeenCalled()
  })
})
