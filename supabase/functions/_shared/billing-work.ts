export async function withBillingProviderWork(
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
  work: () => Promise<Response>,
  headers: Record<string, string> = {},
): Promise<Response> {
  const unavailable = () => new Response('Unavailable', { status: 503, headers })
  const attemptId = crypto.randomUUID()
  const reserved = await rpc('billing_begin_provider_work', { p_attempt_id: attemptId })
  if (reserved.error || reserved.data !== true) return unavailable()
  try {
    const response = await work()
    // Failure/response loss may leave an uncertain provider outcome. Never time
    // out a claim while its old invocation might still be runnable.
    if (!response.ok) return response
    const completed = await rpc('billing_finish_provider_work', { p_attempt_id: attemptId })
    return completed.error || completed.data !== true ? unavailable() : response
  } catch {
    return unavailable()
  }
}
