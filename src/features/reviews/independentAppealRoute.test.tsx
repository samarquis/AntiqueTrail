import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  IndependentAppealRoute,
  type IndependentAppealReviewClient,
} from './independentAppealRoute'

function client(): IndependentAppealReviewClient {
  return {
    requestAssertion: vi.fn(),
    completeAssertion: vi.fn(),
    getPacket: vi.fn(),
    submit: vi.fn(),
  }
}

describe('IndependentAppealRoute', () => {
  it('fails closed without a token and does not advertise a normal navigation link', () => {
    render(
      <MemoryRouter>
        <IndependentAppealRoute token={null} client={client()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      /invalid, expired, revoked, or unavailable/iu,
    )
    expect(screen.queryByRole('link', { name: /appeal|review/iu })).not.toBeInTheDocument()
  })

  it('requires identity verification before rendering packet fields', () => {
    render(
      <MemoryRouter>
        <IndependentAppealRoute token={'A'.repeat(32)} client={client()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /verify identity/iu })).toBeInTheDocument()
    expect(screen.queryByText(/assigned case packet/iu)).not.toBeInTheDocument()
  })
})
