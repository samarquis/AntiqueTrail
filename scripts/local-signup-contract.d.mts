export interface LocalMailboxMessage {
  text?: string
  html?: string
  subject?: string
}

export function readMailbox(input: {
  endpoint: string
  email: string
  signal?: AbortSignal
  fetcher?: typeof fetch
}): Promise<LocalMailboxMessage[]>
