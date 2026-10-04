import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage } from './components'
import { demoCatalogClient } from './demoClient'
import type { CatalogClient, CatalogFilters } from './types'

function catalogClient() {
  return {
    ...demoCatalogClient,
    list: vi.fn((filters: CatalogFilters) => demoCatalogClient.list(filters)),
  }
}

function renderBrowse(client: CatalogClient, initialSearch = '') {
  window.history.replaceState({}, '', `/stores${initialSearch}`)
  return render(<BrowsePage client={client} initialSearch={initialSearch} />)
}

function mockVisible(element: HTMLElement) {
  return vi.spyOn(element, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList)
}

describe('Browse filter commit behavior', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/')
    window.sessionStorage.clear()
  })

  it('keeps query, category, and area as draft until Apply filters', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    renderBrowse(client)

    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()
    expect(
      screen.queryByText('Filters are active. Open Filters to review or clear them.'),
    ).not.toBeInTheDocument()
    const filtersButton = screen.getByRole('button', { name: /^filters$/i })
    await user.click(filtersButton)

    const search = screen.getByRole('textbox', { name: 'Search stores' })
    const category = screen.getByLabelText('Category')
    const area = screen.getByLabelText('Area')
    await user.type(search, 'filter-501-no-match')
    await user.selectOptions(category, 'vintage')
    await user.selectOptions(area, 'topeka-ks')

    expect(search).toHaveValue('filter-501-no-match')
    expect(category).toHaveValue('vintage')
    expect(area).toHaveValue('topeka-ks')
    expect(window.location.pathname + window.location.search).toBe('/stores')
    expect(screen.getByRole('heading', { name: '12 stores to explore' })).toBeVisible()
    expect(
      screen.queryByText('Filters are active. Open Filters to review or clear them.'),
    ).not.toBeInTheDocument()
    expect(client.list).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByText('No stores match those filters.')).toBeVisible()
    expect(window.location.pathname + window.location.search).toBe(
      '/stores?q=filter-501-no-match&category=vintage&area=topeka-ks',
    )
    expect(
      screen.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toBeVisible()
    expect(client.list).toHaveBeenCalledTimes(2)
    expect(client.list).toHaveBeenLastCalledWith({
      q: 'filter-501-no-match',
      category: 'vintage',
      area: 'topeka-ks',
    })
  })

  it.each(['Search', 'Enter', 'Apply filters'] as const)(
    'commits the same normalized snapshot through %s',
    async (submission) => {
      const user = userEvent.setup()
      const client = catalogClient()
      renderBrowse(client)
      expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

      const filtersButton = screen.getByRole('button', { name: /^filters$/i })
      await user.click(filtersButton)
      const search = screen.getByRole('textbox', { name: 'Search stores' })
      const searchButton = screen.getByRole('button', { name: /^Search$/ })
      await user.type(search, '  filter-501-no-match  ')
      await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
      await user.selectOptions(screen.getByLabelText('Area'), 'topeka-ks')

      if (submission === 'Search') {
        await user.click(searchButton)
      } else if (submission === 'Enter') {
        await user.click(search)
        await user.keyboard('{Enter}')
      } else {
        mockVisible(filtersButton)
        await user.click(screen.getByRole('button', { name: 'Apply filters' }))
      }

      expect(await screen.findByText('No stores match those filters.')).toBeVisible()
      expect(window.location.pathname + window.location.search).toBe(
        '/stores?q=filter-501-no-match&category=vintage&area=topeka-ks',
      )
      expect(client.list).toHaveBeenCalledTimes(2)
      expect(client.list).toHaveBeenLastCalledWith({
        q: 'filter-501-no-match',
        category: 'vintage',
        area: 'topeka-ks',
      })
      if (submission === 'Search') expect(searchButton).toHaveFocus()
      else if (submission === 'Enter') expect(search).toHaveFocus()
      else expect(filtersButton).toHaveFocus()
    },
  )

  it('preserves an applied query while category remains draft until submission', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    renderBrowse(client, '?q=clock')

    expect(await screen.findByText('No stores match those filters.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue('clock')
    expect(window.location.pathname + window.location.search).toBe('/stores?q=clock')
    expect(
      screen.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^filters(?: · active)?$/i }))
    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')

    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue('clock')
    expect(window.location.pathname + window.location.search).toBe('/stores?q=clock')
    expect(
      screen.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toBeVisible()
    expect(client.list).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByText('No stores match those filters.')).toBeVisible()
    expect(window.location.pathname + window.location.search).toBe(
      '/stores?q=clock&category=vintage',
    )
    expect(
      screen.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toBeVisible()
    expect(client.list).toHaveBeenLastCalledWith({ q: 'clock', category: 'vintage' })

    const emptyState = screen
      .getAllByRole('status')
      .find((status) => status.textContent?.includes('No stores match those filters.'))
    if (!emptyState) throw new Error('Expected the empty results status')
    await user.click(within(emptyState).getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()
    expect(window.location.pathname + window.location.search).toBe('/stores')
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue('')
  })

  it('keeps draft-only values clearable without changing applied criteria first', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    renderBrowse(client)
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    const search = screen.getByRole('textbox', { name: 'Search stores' })
    await user.type(search, 'draft-only')
    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
    await user.selectOptions(screen.getByLabelText('Area'), 'topeka-ks')

    const clear = screen.getByRole('button', { name: 'Clear filters' })
    const filtersButton = screen.getByRole('button', { name: /^filters$/i })
    mockVisible(filtersButton)
    expect(clear).toBeEnabled()
    expect(window.location.pathname + window.location.search).toBe('/stores')
    expect(screen.getByRole('heading', { name: '12 stores to explore' })).toBeVisible()
    expect(client.list).toHaveBeenCalledTimes(1)

    await user.click(clear)

    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()
    expect(filtersButton).toHaveFocus()
    expect(window.location.pathname + window.location.search).toBe('/stores')
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Area')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })

  it('returns focus to Search when the Filters trigger is hidden after Apply', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    renderBrowse(client)
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

    const filtersButton = screen.getByRole('button', { name: /^filters$/i })
    await user.click(filtersButton)
    filtersButton.style.display = 'none'
    await user.type(screen.getByRole('textbox', { name: 'Search stores' }), 'filter-501-no-match')
    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')

    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByText('No stores match those filters.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveFocus()
  })

  it('restores focus after Apply when the panel state is already closed', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    renderBrowse(client)
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

    const filtersButton = screen.getByRole('button', { name: /^filters$/i })
    mockVisible(filtersButton)
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(filtersButton).toHaveFocus()
  })

  it('retains the submitted snapshot and reports a request error', async () => {
    const user = userEvent.setup()
    const list = vi.fn((filters: CatalogFilters) => demoCatalogClient.list(filters))
    const client: CatalogClient = { ...demoCatalogClient, list }
    renderBrowse(client)
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    const search = screen.getByRole('textbox', { name: 'Search stores' })
    await user.type(search, 'filter-501-no-match')
    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
    await user.selectOptions(screen.getByLabelText('Area'), 'topeka-ks')
    expect(list).toHaveBeenCalledTimes(1)

    list.mockRejectedValueOnce(new Error('Catalog temporarily unavailable'))
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog temporarily unavailable')
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue(
      'filter-501-no-match',
    )
    expect(screen.getByLabelText('Category')).toHaveValue('vintage')
    expect(screen.getByLabelText('Area')).toHaveValue('topeka-ks')
    expect(window.location.pathname + window.location.search).toBe(
      '/stores?q=filter-501-no-match&category=vintage&area=topeka-ks',
    )
    expect(screen.queryByText('No stores match those filters.')).not.toBeInTheDocument()
  })

  it('restores the applied snapshot from the URL after reload', async () => {
    const user = userEvent.setup()
    const client = catalogClient()
    const view = renderBrowse(client)
    expect(await screen.findByRole('heading', { name: '12 stores to explore' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /^filters$/i }))
    await user.type(screen.getByRole('textbox', { name: 'Search stores' }), 'Cedar')
    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
    await user.selectOptions(screen.getByLabelText('Area'), 'topeka-ks')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    expect(await screen.findByRole('heading', { name: 'Cedar & Brass' })).toBeVisible()
    const appliedSearch = window.location.search
    expect(appliedSearch).toBe('?q=Cedar&category=vintage&area=topeka-ks')

    view.unmount()
    const reloadedClient = catalogClient()
    renderBrowse(reloadedClient, appliedSearch)

    expect(await screen.findByRole('heading', { name: 'Cedar & Brass' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toHaveValue('Cedar')
    expect(screen.getByLabelText('Category')).toHaveValue('vintage')
    expect(screen.getByLabelText('Area')).toHaveValue('topeka-ks')
    expect(reloadedClient.list).toHaveBeenCalledWith({
      q: 'Cedar',
      category: 'vintage',
      area: 'topeka-ks',
    })
  })
})
