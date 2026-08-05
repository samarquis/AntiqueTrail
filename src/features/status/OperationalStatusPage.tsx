export interface OperationalStatusConfig {
  supportUrl?: string
  securityUrl?: string
  statusUrl?: string
  responseCommitment?: string
}

function safeOperationalUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    if (url.protocol === 'https:') return url.toString()
    if (url.protocol === 'mailto:' && !url.search && !url.hash) return url.toString()
    return null
  } catch {
    return null
  }
}

export function OperationalStatusPage({ config }: { config: OperationalStatusConfig }) {
  const supportUrl = safeOperationalUrl(config.supportUrl)
  const securityUrl = safeOperationalUrl(config.securityUrl)
  const statusUrl = safeOperationalUrl(config.statusUrl)
  const responseCommitment = config.responseCommitment?.normalize('NFKC').trim()
  const ready = Boolean(supportUrl && securityUrl && statusUrl && responseCommitment)

  if (!ready)
    return (
      <section className="page-card" aria-labelledby="operational-status-heading">
        <h1 id="operational-status-heading">Service status</h1>
        <p role="status">
          Operational contacts are not published until the S-01 monitoring and response gate is
          fully configured.
        </p>
      </section>
    )

  return (
    <section className="page-card" aria-labelledby="operational-status-heading">
      <h1 id="operational-status-heading">Service status</h1>
      <p>{responseCommitment}</p>
      <ul>
        <li>
          <a href={statusUrl!} rel="noreferrer">
            Current service status
          </a>
        </li>
        <li>
          <a href={supportUrl!} rel="noreferrer">
            Contact support
          </a>
        </li>
        <li>
          <a href={securityUrl!} rel="noreferrer">
            Report a security concern
          </a>
        </li>
      </ul>
      <p>Do not include passwords, payment details, or other sensitive personal information.</p>
    </section>
  )
}
