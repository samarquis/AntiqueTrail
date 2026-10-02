import { expect, it, vi } from 'vitest'
import { runOwnerCancellationWorker } from '../../../supabase/functions/_shared/owner-cancellation-worker'

it('staged-off fake servicing leaves legacy servicing unchanged', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { enabled: false, intentIds: [] }, error: null })
  await expect(runOwnerCancellationWorker(rpc)).resolves.toBeNull()
  expect(rpc).toHaveBeenCalledTimes(1)
})

it('lost execution response remains pending and restart uses the same durable intent', async () => {
  const id = '42600000-0000-4000-8000-000000000001'
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: { enabled: true, intentIds: [id] }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'response lost' } })
  await expect(runOwnerCancellationWorker(rpc)).resolves.toEqual({ pending: 1 })
  expect(rpc).toHaveBeenCalledTimes(2)
  rpc
    .mockResolvedValueOnce({ data: { enabled: true, intentIds: [id] }, error: null })
    .mockResolvedValueOnce({ data: { state: 'verified' }, error: null })
    .mockResolvedValueOnce({ data: { state: 'scheduled' }, error: null })
  await expect(runOwnerCancellationWorker(rpc)).resolves.toEqual({ pending: 0 })
  expect(
    rpc.mock.calls
      .filter(([name]) => name === 'billing_execute_owner_fake_cancellation')
      .map(([, args]) => args),
  ).toEqual([{ p_intent_id: id }, { p_intent_id: id }])
})

it('malformed worker inventory cannot dispatch a supplied command', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { enabled: true, intentIds: ['invalid'] }, error: null })
  await expect(runOwnerCancellationWorker(rpc)).rejects.toThrow('Cancellation worker unavailable')
  expect(rpc).toHaveBeenCalledTimes(1)
})
