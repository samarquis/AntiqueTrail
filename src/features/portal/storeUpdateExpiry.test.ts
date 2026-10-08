// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createStoreUpdateExpiryHandler } from '../../../supabase/functions/store-update-expiry/handler'

it('requires scheduler authentication before creating the restricted worker client', async () => {
  const createClient = vi.fn(() => ({ rpc: vi.fn() }))
  const handler = createStoreUpdateExpiryHandler({
    url: 'http://supabase.invalid',
    workerJwt: 'worker-jwt',
    schedulerToken: 'scheduler-secret',
    createClient,
  })

  const missing = await handler(new Request('http://edge.invalid', { method: 'POST' }))
  const wrong = await handler(
    new Request('http://edge.invalid', {
      method: 'POST',
      headers: { 'x-antique-trail-scheduler': 'wrong-secret' },
    }),
  )

  expect(missing.status).toBe(401)
  expect(wrong.status).toBe(401)
  expect(createClient).not.toHaveBeenCalled()
})

it('uses server time and fixed batch size, ignoring caller-supplied sweep parameters', async () => {
  const rpc = vi.fn(async () => ({ data: 2, error: null }))
  const createClient = vi.fn(() => ({ rpc }))
  const handler = createStoreUpdateExpiryHandler({
    url: 'http://supabase.invalid',
    workerJwt: 'worker-jwt',
    schedulerToken: 'scheduler-secret',
    now: () => new Date('2030-03-11T05:00:00.000Z'),
    createClient,
  })

  const response = await handler(
    new Request('http://edge.invalid', {
      method: 'POST',
      headers: { 'x-antique-trail-scheduler': 'scheduler-secret' },
      body: JSON.stringify({ p_now: '1900-01-01T00:00:00Z', p_limit: 1 }),
    }),
  )

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ expired: 2 })
  expect(createClient).toHaveBeenCalledWith('http://supabase.invalid', 'worker-jwt')
  expect(rpc).toHaveBeenCalledWith('portal_expire_store_sales', {
    p_now: '2030-03-11T05:00:00.000Z',
    p_limit: 100,
  })
})
