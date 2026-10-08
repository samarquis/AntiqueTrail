type ExpiryRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

export function createStoreUpdateExpiryHandler(dependencies: {
  url?: string
  workerJwt?: string
  schedulerToken?: string
  now?: () => Date
  createClient: (url: string, jwt: string) => ExpiryRpcClient
}) {
  return async (request: Request): Promise<Response> => {
    const suppliedToken = request.headers.get('x-antique-trail-scheduler')
    if (!(await schedulerAuthorized(dependencies.schedulerToken, suppliedToken)))
      return new Response('Unauthorized', { status: 401 })
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    if (!dependencies.url || !dependencies.workerJwt)
      return new Response('Unavailable', { status: 503 })

    try {
      const client = dependencies.createClient(dependencies.url, dependencies.workerJwt)
      const result = await client.rpc('portal_expire_store_sales', {
        p_now: (dependencies.now?.() ?? new Date()).toISOString(),
        p_limit: 100,
      })
      if (
        result.error ||
        typeof result.data !== 'number' ||
        !Number.isSafeInteger(result.data) ||
        result.data < 0
      )
        return new Response('Unavailable', { status: 503 })
      return Response.json({ expired: result.data })
    } catch {
      return new Response('Unavailable', { status: 503 })
    }
  }
}

async function schedulerAuthorized(expectedToken?: string, suppliedToken?: string | null) {
  if (!expectedToken || !suppliedToken) return false
  const digests = await Promise.all(
    [expectedToken, suppliedToken].map((token) =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
  )
  const expected = new Uint8Array(digests[0]!)
  const supplied = new Uint8Array(digests[1]!)
  let difference = 0
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected[index]! ^ supplied[index]!
  return difference === 0
}
