import { describe, expect, it, vi } from 'vitest'
import {
  validateRegistrationEndpoints,
  withDeadline,
} from '../../../supabase/functions/_shared/registration-config'

const productionEndpoints = {
  appOrigin: 'https://trail.example',
  approvedAppOrigin: 'https://trail.example',
  mailEndpoint: 'https://mail.example/send',
  approvedMailEndpoint: 'https://mail.example/send',
  supabaseUrl: 'https://project.supabase.co',
  approvedSupabaseOrigin: 'https://project.supabase.co',
  localMode: false,
}

describe('registration provider configuration', () => {
  it('accepts strict production endpoints', () => {
    expect(
      validateRegistrationEndpoints({
        ...productionEndpoints,
      }),
    ).toEqual({
      appOrigin: 'https://trail.example',
      mailEndpoint: 'https://mail.example/send',
      supabaseOrigin: 'https://project.supabase.co',
    })
  })
  it.each([
    'http://trail.example',
    'https://user@trail.example',
    'https://trail.example/path',
    'https://trail.example?x=1',
    'https://trail.example/#x',
  ])('rejects unsafe app origin %s', (appOrigin) =>
    expect(() =>
      validateRegistrationEndpoints({
        ...productionEndpoints,
        appOrigin,
      }),
    ).toThrow(),
  )
  it.each([
    'http://mail.example/send',
    'https://mail.example/other',
    'https://mail.example/send?x=1',
    'https://user@mail.example/send',
  ])('rejects unsafe mail endpoint %s', (mailEndpoint) =>
    expect(() =>
      validateRegistrationEndpoints({
        ...productionEndpoints,
        mailEndpoint,
      }),
    ).toThrow(),
  )
  it('permits http only for explicit localhost local mode', () =>
    expect(
      validateRegistrationEndpoints({
        appOrigin: 'http://127.0.0.1:4173',
        approvedAppOrigin: 'http://127.0.0.1:4173',
        mailEndpoint: 'http://localhost:9000/send',
        approvedMailEndpoint: 'http://localhost:9000/send',
        supabaseUrl: 'http://127.0.0.1:54321',
        approvedSupabaseOrigin: 'http://127.0.0.1:54321',
        localMode: true,
      }),
    ).toBeTruthy())
  it.each([
    { mailEndpoint: 'https://evil.mail.example/send' },
    { mailEndpoint: 'https://mail.example:444/send' },
    { supabaseUrl: 'https://evil-project.supabase.co' },
    { supabaseUrl: 'https://project.supabase.co.evil.example' },
    { supabaseUrl: 'https://project.supabase.co:444' },
    { appOrigin: 'https://evil.example' },
    { appOrigin: 'https://trail.example.evil.example' },
    { appOrigin: 'https://trail.example:444' },
    { approvedAppOrigin: 'https://other.example' },
  ])('rejects endpoint lookalikes and port changes %#', (override) =>
    expect(() => validateRegistrationEndpoints({ ...productionEndpoints, ...override })).toThrow(),
  )
  it('aborts operations at the bounded deadline', async () => {
    vi.useFakeTimers()
    const pending = withDeadline(
      100,
      (signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const assertion = expect(pending).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    vi.useRealTimers()
  })
})
