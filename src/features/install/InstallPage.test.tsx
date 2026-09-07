import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallPage } from './InstallPage'

describe('InstallPage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows actionable fallback guidance without a browser prompt', () => {
    render(
      <MemoryRouter>
        <InstallPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /install antique trail/i })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Computer' })).toBeVisible()
    expect(screen.getByRole('heading', { name: /iphone or ipad/i })).toBeVisible()
    expect(screen.queryByRole('button', { name: /install antique trail/i })).not.toBeInTheDocument()
  })

  it('opens the captured prompt only after explicit activation', async () => {
    const user = userEvent.setup()
    const prompt = vi.fn(async () => undefined)
    const event = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    }
    event.prompt = prompt
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    render(
      <MemoryRouter>
        <InstallPage />
      </MemoryRouter>,
    )
    window.dispatchEvent(event)
    const button = await screen.findByRole('button', { name: /install antique trail/i })
    expect(prompt).not.toHaveBeenCalled()
    await user.click(button)
    expect(prompt).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent(/installation started/i)
  })
})
