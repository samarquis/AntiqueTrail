import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from './states'

describe('catalog error state', () => {
  it('offers recovery without removing the guest from the browse journey', () => {
    render(
      <MemoryRouter>
        <ErrorState message="Catalog unavailable. Please try again." onRetry={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Retry loading stores' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /get help/i })).toHaveAttribute('href', '/help')
  })
})
