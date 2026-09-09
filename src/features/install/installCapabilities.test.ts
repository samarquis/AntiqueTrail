import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStandaloneDisplayMode, listenForInstallPrompt } from './installCapabilities'

describe('install capabilities', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports the browser display mode without assuming installation', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
    })
    expect(isStandaloneDisplayMode()).toBe(false)
  })

  it('captures a browser prompt only when the browser provides one', () => {
    const onPrompt = vi.fn()
    const remove = listenForInstallPrompt(onPrompt)
    window.dispatchEvent(new Event('beforeinstallprompt'))
    expect(onPrompt).toHaveBeenCalledOnce()
    remove()
  })
})
