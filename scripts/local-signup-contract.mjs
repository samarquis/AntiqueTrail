/* global URL, fetch, AbortSignal */
export function confirmationUrl(messages, authOrigin, appOrigin) {
  const auth = new URL(authOrigin)
  const app = new URL(appOrigin)
  if (
    auth.protocol !== 'http:' ||
    auth.hostname !== '127.0.0.1' ||
    app.protocol !== 'http:' ||
    app.hostname !== '127.0.0.1' ||
    app.pathname !== '/' ||
    app.search ||
    app.hash
  )
    throw new Error('local callback link unavailable')
  for (const message of messages) {
    const content = [message.text, message.html, message.body]
      .filter((part) => typeof part === 'string')
      .join('\n')
      .replaceAll('&amp;', '&')
    for (const candidate of content.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      try {
        const link = new URL(candidate)
        const destination = link.searchParams.get('redirect_to')
        if (
          link.origin === auth.origin &&
          link.pathname === '/auth/v1/verify' &&
          ['signup', 'email'].includes(link.searchParams.get('type') ?? '') &&
          destination === `${app.origin}/auth/callback` &&
          link.searchParams.has('token')
        )
          return link.href
      } catch {
        /* Ignore malformed email links. */
      }
    }
  }
  throw new Error('local callback link unavailable')
}

export function registrationEnvironment({ appOrigin, supabaseOrigin, mailOrigin, secret }) {
  const endpoints = [appOrigin, supabaseOrigin, mailOrigin].map((value) => new URL(value))
  if (
    endpoints.some(
      (url) =>
        url.protocol !== 'http:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash,
    ) ||
    endpoints[0].hostname !== '127.0.0.1' ||
    endpoints[1].origin !== 'http://kong:8000' ||
    endpoints[2].hostname !== '127.0.0.1' ||
    !/^[a-f0-9]{64,}$/i.test(secret)
  )
    throw new Error('registration settings require local endpoints and a private HMAC key')
  const sendEndpoint = `${endpoints[2].origin}/send`
  return [
    `APP_ORIGIN=${endpoints[0].origin}`,
    `REGISTRATION_APPROVED_APP_ORIGIN=${endpoints[0].origin}`,
    `REGISTRATION_APPROVED_SUPABASE_ORIGIN=${endpoints[1].origin}`,
    `REGISTRATION_MAIL_ENDPOINT=${sendEndpoint}`,
    `REGISTRATION_APPROVED_MAIL_ENDPOINT=${sendEndpoint}`,
    `REGISTRATION_LOCAL_MODE=true`,
    `REGISTRATION_EMAIL_HMAC_SECRET=${secret}`,
  ].join('\n')
}

export function sanitizeJourneyError(error) {
  return String(error)
    .replace(/eyJ[A-Za-z0-9_.-]+|\b(?:sb-|sk_|pk_)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/[^\s"'<>]+/g, '[local URL]')
    .slice(0, 1200)
}

export async function readMailbox({ endpoint, mailbox, fetcher = fetch, signal }) {
  const base = new URL(endpoint)
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !/^[a-z0-9-]{1,80}$/i.test(mailbox)
  )
    throw new Error('local mailbox endpoint unavailable')
  const response = await fetcher(`${base.origin}/api/v1/mailbox/${mailbox}`, {
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`local mailbox HTTP ${response.status}`)
  const data = await response.json()
  const summaries = Array.isArray(data) ? data : data.messages
  if (!Array.isArray(summaries)) throw new Error('local mailbox response unavailable')
  return Promise.all(
    summaries.map(async (message) => {
      if (typeof message.text === 'string' || typeof message.html === 'string') return message
      if (typeof message.id !== 'string' || !message.id) return message
      const detail = await fetcher(
        `${base.origin}/api/v1/mailbox/${mailbox}/${encodeURIComponent(message.id)}`,
        {
          redirect: 'error',
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
            : AbortSignal.timeout(5000),
        },
      )
      if (!detail.ok) throw new Error(`local message HTTP ${detail.status}`)
      return detail.json()
    }),
  )
}
