import { expect, it, vi } from 'vitest'
import { withBillingProviderWork } from '../../../supabase/functions/_shared/billing-work'

it('keeps a delayed duplicate invocation fenced after its peer finishes', async () => {
  const active = new Set<string>()
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const token = String(args.p_attempt_id)
    if (name === 'billing_begin_provider_work') active.add(token)
    else if (name === 'billing_finish_provider_work') active.delete(token)
    return { data: true, error: null }
  })
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls: string[] = []
  const delayed = withBillingProviderWork(rpc, async () => {
    await barrier
    calls.push('second provider call')
    return Response.json({ ok: true })
  })
  await withBillingProviderWork(rpc, async () => {
    calls.push('first provider call')
    return Response.json({ ok: true })
  })
  expect(active.size).toBe(1)
  expect(calls).toEqual(['first provider call'])
  release()
  expect((await delayed).status).toBe(200)
  expect(active.size).toBe(0)
  expect(calls).toEqual(['first provider call', 'second provider call'])
  const tokens = rpc.mock.calls
    .filter(([name]) => name === 'billing_begin_provider_work')
    .map(([, args]) => args.p_attempt_id)
  expect(new Set(tokens).size).toBe(2)
})

it('does no provider work when off-state reservation is denied', async () => {
  const work = vi.fn()
  const rpc = vi.fn(async () => ({ data: null, error: { message: 'billing_stage_disabled' } }))
  expect((await withBillingProviderWork(rpc, work)).status).toBe(503)
  expect(work).not.toHaveBeenCalled()
  expect(rpc).toHaveBeenCalledOnce()
})

it.each(['failed', 'crashed'])(
  'leaves %s invocations for verified reconciliation',
  async (mode) => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const result = await withBillingProviderWork(rpc, async () => {
      if (mode === 'crashed') throw new Error('response loss')
      return new Response('Unavailable', { status: 503 })
    })
    expect(result.status).toBe(503)
    expect(rpc).toHaveBeenCalledOnce()
  },
)
