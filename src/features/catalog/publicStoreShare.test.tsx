import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailsPage } from './components'
import { syntheticStores } from './demoClient'
import { createPublicStoreUrl, StoreShareControl } from './publicStoreShare'
import type { CatalogClient } from './types'

const store = { name: 'Blue Finch Curios', slug: 'blue-finch-curios' }

function stubBrowserApis({
  share,
  writeText,
}: {
  share?: (data: ShareData) => Promise<void>
  writeText?: (text: string) => Promise<void>
}) {
  vi.stubGlobal('navigator', {
    share,
    clipboard: writeText ? { writeText } : undefined,
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('public store sharing', () => {
  it('builds the configured same-origin route without carrying query or fragment state', () => {
    expect(
      createPublicStoreUrl(
        store.slug,
        '/catalog/',
        'https://shops.example/stores/old?account=private#trip-private',
      ),
    ).toBe('https://shops.example/catalog/stores/blue-finch-curios')
  })

  it('rejects invalid slugs, hostile origins, and malformed bases', () => {
    for (const slug of ['', '..', '../account', 'Blue Finch', 'store?account=1']) {
      expect(createPublicStoreUrl(slug, '/', 'https://shops.example/')).toBeNull()
    }
    expect(
      createPublicStoreUrl(
        store.slug,
        'https://attacker.example/catalog/',
        'https://shops.example/stores/current',
      ),
    ).toBeNull()
    expect(
      createPublicStoreUrl(
        store.slug,
        '/catalog?token=private#trip',
        'https://shops.example/stores/current',
      ),
    ).toBeNull()
  })

  it('hides the previous store link when the requested slug changes before new details load', async () => {
    const store = syntheticStores[0]
    const client: CatalogClient = {
      list: vi.fn(async () => ({ stores: [], generatedAt: '2026-10-07' })),
      details: vi.fn((slug) =>
        slug === store.slug ? Promise.resolve(store) : new Promise<typeof store>(() => undefined),
      ),
    }
    const view = render(<DetailsPage client={client} slug={store.slug} />)
    await screen.findByRole('button', { name: /^(Share store|Copy link)$/u })

    view.rerender(<DetailsPage client={client} slug="different-store" />)

    expect(
      screen.queryByRole('button', { name: /^(Share store|Copy link)$/u }),
    ).not.toBeInTheDocument()
  })

  it('shares only public title and URL, and leaves a native-share cancellation quiet', async () => {
    const share = vi.fn(async () => undefined)
    stubBrowserApis({ share })

    render(<StoreShareControl store={store} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Share store' }))

    expect(share).toHaveBeenCalledWith({
      title: store.name,
      url: `${window.location.origin}/stores/${store.slug}`,
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const cancelled = new DOMException('dismissed', 'AbortError')
    share.mockRejectedValueOnce(cancelled)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Share store' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })

  it('offers a copy fallback after share failure and supports copy retry', async () => {
    const share = vi.fn(async () => {
      throw new Error('share unavailable')
    })
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('clipboard denied'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    stubBrowserApis({ share, writeText })

    render(<StoreShareControl store={store} />)
    await user.click(screen.getByRole('button', { name: 'Share store' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/sharing failed/i)

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    const linkInput = await screen.findByRole('textbox', { name: 'Public store link' })
    expect(linkInput).toHaveValue(`${window.location.origin}/stores/${store.slug}`)
    expect(linkInput).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/link copied/i)
  })

  it('copies when native sharing is unavailable and exposes a keyboard-selectable URL on denial', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied')
    })
    const user = userEvent.setup()
    stubBrowserApis({ writeText })

    render(<StoreShareControl store={store} />)
    const copyButton = screen.getByRole('button', { name: 'Copy link' })
    await user.click(copyButton)

    const linkInput = await screen.findByRole('textbox', { name: 'Public store link' })
    expect(linkInput).toHaveValue(`${window.location.origin}/stores/${store.slug}`)
    expect(linkInput).toHaveAttribute('readonly')
    await user.tab()
    expect(linkInput).toHaveFocus()
    expect((linkInput as HTMLInputElement).selectionStart).toBe(0)
    expect((linkInput as HTMLInputElement).selectionEnd).toBe(
      `${window.location.origin}/stores/${store.slug}`.length,
    )
  })
})
