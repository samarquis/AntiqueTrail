import type { SupabaseClient } from '@supabase/supabase-js'
import { createRpcSessionRegistry, toAuthSession } from '../auth/authClient'

/** Register each new provider token before any research request; tokens stay in memory. */
export function createOwnerResearchSession(supabase: {
  auth: Pick<SupabaseClient['auth'], 'getSession'>
  rpc(
    command: string,
    payload: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: unknown }>
}) {
  let registeredToken: string | undefined
  const registry = createRpcSessionRegistry({
    async invoke(command, payload) {
      const result = await supabase.rpc(command, payload)
      if (result.error) throw result.error
      return result.data
    },
  })
  return async () => {
    const result = await supabase.auth.getSession()
    const session = result.data.session
    if (result.error || !session?.expires_at) throw new Error('Research session unavailable')
    if (registeredToken === session.access_token) return
    await registry.registerCurrentSession(
      toAuthSession({
        userId: session.user.id,
        accessToken: session.access_token,
        expiresAt: session.expires_at * 1000,
      }),
    )
    registeredToken = session.access_token
  }
}
