import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import { createOwnerResearchSession } from './ownerResearchSession'

it('registers new provider sessions before use, refreshes changed tokens, and retries failed registration', async () => {
  let token = 'first-token'
  let registrationFails = false
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/auth/v1/token'))
      return new Response(
        JSON.stringify({
          access_token: token,
          refresh_token: 'synthetic-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: '80000000-0000-4000-8000-000000000001', aud: 'authenticated' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    expect(String(input)).toContain('/rpc/register_current_session')
    expect(new Headers(init?.headers).get('Content-Profile')).toBe('app_public')
    expect(JSON.parse(String(init?.body)).access_token_expires_at).toBeGreaterThan(Date.now())
    return new Response(registrationFails ? '{"message":"denied"}' : 'true', {
      status: registrationFails ? 403 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  const supabase = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  })
  const ensure = createOwnerResearchSession(supabase)
  await expect(ensure()).rejects.toThrow('Research session unavailable')
  expect(fetch).not.toHaveBeenCalled()
  await supabase.auth.signInWithPassword({ email: 'participant@example.test', password: 'test' })
  await ensure()
  await ensure()
  expect(fetch).toHaveBeenCalledTimes(2)
  token = 'refreshed-token'
  await supabase.auth.refreshSession()
  registrationFails = true
  await expect(ensure()).rejects.toBeDefined()
  registrationFails = false
  await ensure()
  expect(fetch).toHaveBeenCalledTimes(5)
})
