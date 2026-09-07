import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { demoCatalogClient } from '../features/catalog'
import App from './App'

describe('normal owner-intake composition', () => {
  afterEach(cleanup)

  it('reaches the search branch from server-owned availability without a harness runtime', async () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/for-stores'] },
        createElement(App, {
          clients: {
            catalog: demoCatalogClient,
            ownerIntakeAvailability: {
              getAvailability: async () => ({
                routeVisible: true,
                intakeAvailable: true,
                claimsAvailable: true,
              }),
            },
          },
        }),
      ),
    )

    expect(await screen.findByRole('heading', { name: /help antique shoppers/i })).toBeVisible()
    expect(screen.queryByText(/review harness/i)).not.toBeInTheDocument()
  })
})
