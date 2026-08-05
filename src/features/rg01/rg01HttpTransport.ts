import type { RG01Command } from '../../../supabase/functions/_shared/rg01-command'
import { RG01CommandError, type RG01Transport } from './rg01Client'

interface Options {
  endpoint: string
  getAccessToken: () => Promise<string>
  fetcher?: typeof fetch
}

export function createRG01HttpTransport({
  endpoint,
  getAccessToken,
  fetcher = fetch,
}: Options): RG01Transport {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('RG-01 endpoint must use HTTPS')
  return {
    async execute(command: RG01Command) {
      try {
        const token = await getAccessToken()
        if (!token) throw new RG01CommandError()
        const result = await fetcher(url.toString(), {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(command),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        })
        if (!result.ok || !result.headers.get('content-type')?.includes('application/json'))
          throw new RG01CommandError()
        return await result.json()
      } catch (error) {
        if (error instanceof RG01CommandError) throw error
        throw new RG01CommandError()
      }
    },
  }
}
