import { describe, expect, it, vi } from 'vitest'
import { installBackgroundPlaintextClearer } from './tripRuntime'

describe('background private plaintext lifetime', () => {
  it('clears private UI plaintext after fifteen minutes in the background', () => {
    vi.useFakeTimers()
    const listeners = new Set<() => void>()
    const target = {
      visibilityState: 'visible',
      addEventListener: (_name: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener),
    }
    const clear = vi.fn()
    const dispose = installBackgroundPlaintextClearer(target, clear)
    target.visibilityState = 'hidden'
    listeners.forEach((listener) => listener())
    vi.advanceTimersByTime(14 * 60_000 + 59_999)
    expect(clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clear).toHaveBeenCalledOnce()
    dispose()
    vi.useRealTimers()
  })
})
