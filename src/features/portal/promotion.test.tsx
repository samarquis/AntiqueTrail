import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PromotionPage, createPromotionClient } from './promotion'

describe('promotion boundary', () => {
  it('fails closed on incomplete, duplicate, or malformed channel data', async () => {
    for (const data of [
      null,
      [],
      Array(4).fill({ channel: 'flyer', consented: true, version: 1, removalRequested: false }),
      Array(4).fill({ channel: 'flyer', consented: 'true', version: -1, removalRequested: false }),
    ])
      await expect(createPromotionClient(async () => data).list()).rejects.toThrow('unavailable')
  })
  it('does not treat denied server commands as saved consent', async () => {
    const rpc = vi.fn().mockResolvedValue({ allowed: false })
    await expect(
      createPromotionClient(rpc).set(
        { channel: 'flyer', consented: false, version: 3, removalRequested: false },
        true,
      ),
    ).rejects.toThrow('unavailable')
    expect(rpc).toHaveBeenCalledWith('promotion_channel_command', {
      p_channel: 'flyer',
      p_operation: 'consent',
      p_version: 3,
      p_generic_owner_card: false,
    })
  })
  it('unconfigured page exposes no permission actions', async () => {
    render(
      <MemoryRouter>
        <PromotionPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
