export interface RegistrationEndpoints {
  appOrigin: string
  approvedAppOrigin: string
  mailEndpoint: string
  approvedMailEndpoint: string
  supabaseUrl: string
  approvedSupabaseOrigin: string
  localMode: boolean
}

export function validateRegistrationEndpoints(input: RegistrationEndpoints): {
  appOrigin: string
  mailEndpoint: string
  supabaseOrigin: string
} {
  const app = parse(input.appOrigin)
  const approvedApp = parse(input.approvedAppOrigin)
  const mail = parse(input.mailEndpoint)
  const approvedMail = parse(input.approvedMailEndpoint)
  const supabase = parse(input.supabaseUrl)
  const approvedSupabase = parse(input.approvedSupabaseOrigin)
  const localhost = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  for (const candidate of [app, approvedApp])
    if (
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash ||
      (candidate.pathname !== '/' && candidate.pathname !== '')
    )
      throw new Error('invalid app origin')
  if (mail.username || mail.password || mail.search || mail.hash || mail.pathname !== '/send')
    throw new Error('invalid mail endpoint')
  for (const candidate of [supabase, approvedSupabase])
    if (
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash ||
      (candidate.pathname !== '/' && candidate.pathname !== '')
    )
      throw new Error('invalid supabase origin')
  if (mail.href !== approvedMail.href) throw new Error('mail endpoint is not approved')
  if (app.origin !== approvedApp.origin) throw new Error('app origin is not approved')
  if (supabase.origin !== approvedSupabase.origin)
    throw new Error('supabase origin is not approved')
  if (input.localMode) {
    if (
      !localhost(app) ||
      !localhost(approvedApp) ||
      !localhost(mail) ||
      !localhost(supabase) ||
      !['http:', 'https:'].includes(app.protocol) ||
      !['http:', 'https:'].includes(mail.protocol) ||
      !['http:', 'https:'].includes(supabase.protocol)
    )
      throw new Error('local endpoints must remain localhost')
  } else if (
    app.protocol !== 'https:' ||
    mail.protocol !== 'https:' ||
    supabase.protocol !== 'https:' ||
    localhost(app) ||
    localhost(mail) ||
    localhost(supabase)
  ) {
    throw new Error('production endpoints require https')
  }
  return { appOrigin: app.origin, mailEndpoint: mail.href, supabaseOrigin: supabase.origin }
}

function parse(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error('invalid registration endpoint')
  }
}

export async function withDeadline<T>(
  milliseconds: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const bounded = Number.isFinite(milliseconds)
    ? Math.max(100, Math.min(milliseconds, 10_000))
    : 10_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), bounded)
  try {
    return await operation(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}
