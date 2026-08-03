export type CandidateExtractionFallbackReason =
  | 'invalid_link'
  | 'private_destination'
  | 'dns_failure'
  | 'dns_rebinding'
  | 'redirect_limit'
  | 'unsupported_content'
  | 'response_too_large'
  | 'timeout'
  | 'rate_limited'
  | 'fetch_failed'

export interface CandidateExtractionSuggestions {
  title: string | null
  description: string | null
  canonicalUrl: string | null
  /** Extracted values can never establish a public catalog fact. */
  verified: false
}

interface CandidateExtractionBase {
  originalLink: string
  originalNote: string
  normalizedUrl: string | null
  destinationHost: string | null
  suggestions: CandidateExtractionSuggestions
  /** Deliberately constant: this boundary cannot write Store or Event records. */
  publicWriteAllowed: false
}

export type CandidateExtractionOutcome =
  | (CandidateExtractionBase & { mode: 'suggestions' })
  | (CandidateExtractionBase & {
      mode: 'manual_fallback'
      reason: CandidateExtractionFallbackReason
    })

export interface CandidateExtractionInput {
  actorKey: string
  link: string
  note: string
}

export interface CandidateExtractionResponse {
  status: number
  headers: Readonly<Record<string, string | undefined>>
  connectedAddress: string
  body: AsyncIterable<Uint8Array> | null
}

export interface CandidateExtractionDependencies {
  rateLimiter: {
    consume(actorKey: string): Promise<boolean>
  }
  resolver: {
    resolve(hostname: string): Promise<readonly string[]>
  }
  transport: {
    /**
     * The server transport must connect only to one of approvedAddresses and
     * report the actual peer. Redirect following is disabled in this call.
     */
    requestPinned(input: {
      url: string
      approvedAddresses: readonly string[]
      signal: AbortSignal
    }): Promise<CandidateExtractionResponse>
  }
}

export interface CandidateExtractionPolicy {
  requestTimeoutMs: number
  maxResponseBytes: number
  maxRedirects: number
}

const DEFAULT_POLICY: CandidateExtractionPolicy = {
  requestTimeoutMs: 4_000,
  maxResponseBytes: 512_000,
  maxRedirects: 3,
}

const EMPTY_SUGGESTIONS: CandidateExtractionSuggestions = {
  title: null,
  description: null,
  canonicalUrl: null,
  verified: false,
}

class ExtractionFailure extends Error {
  constructor(readonly reason: CandidateExtractionFallbackReason) {
    super(reason)
  }
}

export class CandidateExtractionService {
  readonly #policy: CandidateExtractionPolicy

  constructor(
    readonly dependencies: CandidateExtractionDependencies,
    policy: Partial<CandidateExtractionPolicy> = {},
  ) {
    this.#policy = { ...DEFAULT_POLICY, ...policy }
  }

  async extract(input: CandidateExtractionInput): Promise<CandidateExtractionOutcome> {
    const originalLink = input.link.trim()
    const originalNote = input.note
    let initialUrl: URL
    try {
      initialUrl = parseHttpUrl(originalLink)
    } catch {
      return manualFallback(originalLink, originalNote, 'invalid_link')
    }

    if (!(await this.dependencies.rateLimiter.consume(input.actorKey))) {
      return manualFallback(originalLink, originalNote, 'rate_limited', initialUrl)
    }

    try {
      const extracted = await this.#extractFrom(initialUrl)
      return {
        mode: 'suggestions',
        originalLink,
        originalNote,
        normalizedUrl: normalizeForStorage(initialUrl),
        destinationHost: initialUrl.hostname.toLocaleLowerCase(),
        suggestions: extracted,
        publicWriteAllowed: false,
      }
    } catch (error) {
      const reason = error instanceof ExtractionFailure ? error.reason : 'fetch_failed'
      return manualFallback(originalLink, originalNote, reason, initialUrl)
    }
  }

  async #extractFrom(initialUrl: URL): Promise<CandidateExtractionSuggestions> {
    let currentUrl = initialUrl
    for (let redirects = 0; ; redirects += 1) {
      if (redirects > this.#policy.maxRedirects) throw new ExtractionFailure('redirect_limit')

      const approvedAddresses = await this.#resolvePublic(currentUrl.hostname)
      const hop = await this.#runHop(currentUrl, approvedAddresses)
      if (hop.kind === 'redirect') {
        currentUrl = hop.url
        continue
      }
      return hop.suggestions
    }
  }

  async #resolvePublic(hostname: string): Promise<readonly string[]> {
    let addresses: readonly string[]
    try {
      addresses = await this.dependencies.resolver.resolve(hostname)
    } catch {
      throw new ExtractionFailure('dns_failure')
    }
    const unique = [...new Set(addresses)]
    if (unique.length === 0) throw new ExtractionFailure('dns_failure')
    if (!unique.every(isPublicNetworkAddress)) {
      throw new ExtractionFailure('private_destination')
    }
    return unique
  }

  async #runHop(
    url: URL,
    approvedAddresses: readonly string[],
  ): Promise<
    | { kind: 'redirect'; url: URL }
    | { kind: 'suggestions'; suggestions: CandidateExtractionSuggestions }
  > {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new ExtractionFailure('timeout'))
      }, this.#policy.requestTimeoutMs)
    })
    try {
      const operation = async () => {
        const response = await this.dependencies.transport.requestPinned({
          url: url.toString(),
          approvedAddresses,
          signal: controller.signal,
        })
        if (
          !isPublicNetworkAddress(response.connectedAddress) ||
          !approvedAddresses.includes(response.connectedAddress)
        ) {
          throw new ExtractionFailure('dns_rebinding')
        }

        let postRequestAddresses: readonly string[]
        try {
          postRequestAddresses = await this.#resolvePublic(url.hostname)
        } catch {
          // A host that becomes private or unresolvable after the pinned request
          // is indistinguishable from a rebinding attempt and fails closed.
          throw new ExtractionFailure('dns_rebinding')
        }
        if (!sameAddressSet(approvedAddresses, postRequestAddresses)) {
          throw new ExtractionFailure('dns_rebinding')
        }

        if (isRedirect(response.status)) {
          const location = header(response.headers, 'location')
          if (!location) throw new ExtractionFailure('fetch_failed')
          try {
            return {
              kind: 'redirect' as const,
              url: parseHttpUrl(new URL(location, url).toString()),
            }
          } catch {
            throw new ExtractionFailure('private_destination')
          }
        }
        if (response.status < 200 || response.status >= 300) {
          throw new ExtractionFailure('fetch_failed')
        }
        assertSupportedContent(response.headers)
        const body = await readBoundedBody(response, this.#policy.maxResponseBytes)
        return {
          kind: 'suggestions' as const,
          suggestions: extractSuggestions(
            new TextDecoder('utf-8', { fatal: false }).decode(body),
            url,
          ),
        }
      }
      return await Promise.race([operation(), timedOut])
    } catch (error) {
      if (error instanceof ExtractionFailure) throw error
      if (controller.signal.aborted) throw new ExtractionFailure('timeout')
      throw new ExtractionFailure('fetch_failed')
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      controller.abort()
    }
  }
}

export function isCandidateHttpLink(raw: string): boolean {
  try {
    parseHttpUrl(raw.trim())
    return true
  } catch {
    return false
  }
}

function manualFallback(
  originalLink: string,
  originalNote: string,
  reason: CandidateExtractionFallbackReason,
  parsed?: URL,
): CandidateExtractionOutcome {
  return {
    mode: 'manual_fallback',
    reason,
    originalLink,
    originalNote,
    normalizedUrl: parsed ? normalizeForStorage(parsed) : null,
    destinationHost: parsed?.hostname.toLocaleLowerCase() ?? null,
    suggestions: EMPTY_SUGGESTIONS,
    publicWriteAllowed: false,
  }
}

function parseHttpUrl(raw: string): URL {
  const parsed = new URL(raw)
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    raw.length > 2_048
  ) {
    throw new Error('invalid_link')
  }
  parsed.hostname = parsed.hostname.toLocaleLowerCase()
  return parsed
}

function normalizeForStorage(parsed: URL): string {
  const normalized = new URL(parsed)
  normalized.hash = ''
  return normalized.toString()
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status)
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = headers[name]
  if (direct !== undefined) return direct
  const match = Object.entries(headers).find(([key]) => key.toLocaleLowerCase() === name)
  return match?.[1]
}

function assertSupportedContent(headers: Readonly<Record<string, string | undefined>>): void {
  const rawContentType = header(headers, 'content-type')
  const contentType = rawContentType?.split(';', 1)[0]?.trim().toLocaleLowerCase()
  if (!contentType || !['text/html', 'application/xhtml+xml'].includes(contentType)) {
    throw new ExtractionFailure('unsupported_content')
  }
}

async function readBoundedBody(
  response: CandidateExtractionResponse,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(header(response.headers, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ExtractionFailure('response_too_large')
  }
  if (!response.body) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.byteLength
    if (total > maxBytes) throw new ExtractionFailure('response_too_large')
    chunks.push(chunk)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function extractSuggestions(html: string, sourceUrl: URL): CandidateExtractionSuggestions {
  const title = cleanExtractedText(firstMatch(html, /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i), 160)
  const description = cleanExtractedText(
    firstMatch(
      html,
      /<meta\s+(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i,
    ),
    500,
  )
  const canonical = firstMatch(
    html,
    /<link\s+(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']*)["'])[^>]*>/i,
  )
  let canonicalUrl: string | null = null
  if (canonical) {
    try {
      const parsed = parseHttpUrl(new URL(decodeHtml(canonical), sourceUrl).toString())
      canonicalUrl = normalizeForStorage(parsed)
    } catch {
      canonicalUrl = null
    }
  }
  return { title, description, canonicalUrl, verified: false }
}

function firstMatch(value: string, pattern: RegExp): string | null {
  return pattern.exec(value)?.[1] ?? null
}

function cleanExtractedText(value: string | null, maxLength: number): string | null {
  if (!value) return null
  const cleaned = stripControlCharacters(decodeHtml(value.replace(/<[^>]*>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function stripControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127 ? ' ' : character
    })
    .join('')
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  }
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, decimal, hex, named) => {
    if (decimal) return String.fromCodePoint(Number(decimal))
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    return entities[String(named).toLocaleLowerCase()] ?? match
  })
}

function sameAddressSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return a.length === b.length && a.every((address, index) => address === b[index])
}

export function isPublicNetworkAddress(address: string): boolean {
  const ipv4 = parseIpv4(address)
  if (ipv4) return isPublicIpv4(ipv4)
  const ipv6 = parseIpv6(address)
  if (ipv6 === null) return false
  const globalPrefix = ipv6 >> 125n
  if (globalPrefix !== 1n) return false // Only globally routable 2000::/3.
  if (ipv6 >> 96n === 0x20010db8n) return false // Documentation range.
  return true
}

function parseIpv4(address: string): readonly number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^(?:0|[1-9]\d{0,2})$/.test(part) ? Number(part) : -1))
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null
}

function isPublicIpv4(parts: readonly number[]): boolean {
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function parseIpv6(address: string): bigint | null {
  const input = address
    .toLocaleLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%', 1)[0]
  if (!input?.includes(':')) return null
  const halves = input.split('::')
  if (halves.length > 2) return null
  const left = parseIpv6Half(halves[0] ?? '')
  const right = parseIpv6Half(halves[1] ?? '')
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array.from({ length: missing }, () => 0), ...right]
  if (groups.length !== 8) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n)
}

function parseIpv6Half(value: string): number[] | null {
  if (!value) return []
  const groups: number[] = []
  for (const part of value.split(':')) {
    if (part.includes('.')) {
      const ipv4 = parseIpv4(part)
      if (!ipv4) return null
      groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
    } else {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null
      groups.push(Number.parseInt(part, 16))
    }
  }
  return groups
}
