/* global URL, URLSearchParams, fetch, AbortSignal */
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
    for (const rawCandidate of content.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      const candidate = rawCandidate.replace(/[.,;!?]+$/, '')
      try {
        const link = new URL(candidate)
        const callbackParams = new URLSearchParams(link.hash.slice(1))
        if (
          link.origin === app.origin &&
          link.pathname === '/auth/callback' &&
          callbackParams.get('type') === 'verify' &&
          callbackParams.get('token_hash')
        )
          return link.href
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

export async function readMailbox({ endpoint, email, fetcher = fetch, signal }) {
  const base = new URL(endpoint)
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !/^[a-z0-9-]{1,80}@probe\.invalid$/i.test(email)
  )
    throw new Error('local mailbox endpoint unavailable')
  const requestOptions = {
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  }
  const query = new URLSearchParams({ limit: '50' })
  const response = await fetcher(`${base.origin}/api/v1/messages?${query}`, requestOptions)
  if (!response.ok) throw new Error(`local mailbox HTTP ${response.status}`)
  const data = await response.json()
  const summaries = data.messages
  if (!Array.isArray(summaries)) throw new Error('local mailbox response unavailable')
  const messages = await Promise.all(
    summaries.map(async (message) => {
      if (typeof message.ID !== 'string' || !message.ID) return null
      const detail = await fetcher(
        `${base.origin}/api/v1/message/${encodeURIComponent(message.ID)}`,
        requestOptions,
      )
      if (!detail.ok) throw new Error(`local message HTTP ${detail.status}`)
      const full = await detail.json()
      const recipients = Array.isArray(full.To) ? full.To : []
      if (!recipients.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()))
        return null
      return { text: full.Text, html: full.HTML, subject: full.Subject }
    }),
  )
  const matching = messages.filter(Boolean)
  if (!matching.length && summaries.length)
    throw new Error('local mailbox messages do not match the probe recipient')
  return matching
}
