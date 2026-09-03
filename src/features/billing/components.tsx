import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  BILLING_STAGE_DISABLED_MESSAGE,
  GENERIC_BILLING_ERROR,
  isBillingCapabilityEnabled,
} from './billingClient'
import type {
  BillingCapability,
  BillingClient,
  CommercialResearchChoice,
  CommercialResearchConfig,
} from './types'

/**
 * Renders nothing at all unless the server-served capability says ON —
 * Package 13 keeps every billing surface hidden and unreachable by default.
 */
export function BillingGate({
  capability,
  children,
}: {
  capability: BillingCapability | null
  children: ReactNode
}) {
  if (!isBillingCapabilityEnabled(capability)) return null
  return <>{children}</>
}

export function BillingUnavailableNotice() {
  return (
    <p role="status" data-testid="billing-stage-disabled">
      {BILLING_STAGE_DISABLED_MESSAGE}
    </p>
  )
}

function isResearchChoice(value: string): value is CommercialResearchChoice {
  return ['free', 'gallery', 'full_gallery', 'refused', 'abandoned'].includes(value)
}

export function CommercialResearchPage({
  authorizationId,
  artifactDigest,
  questionVersion,
  client,
}: {
  authorizationId: string
  artifactDigest: string
  questionVersion: string
  client: BillingClient
}) {
  const [config, setConfig] = useState<CommercialResearchConfig | null>(null)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState<CommercialResearchChoice>('free')
  const [reasonCode, setReasonCode] = useState('photo_capacity')
  const [consented, setConsented] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const previous = robots?.content
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.append(robots)
    }
    robots.content = 'noindex, nofollow'
    return () => {
      if (previous === undefined) robots?.remove()
      else if (robots) robots.content = previous
    }
  }, [])

  useEffect(() => {
    let active = true
    client
      .getCommercialResearchConfig(authorizationId)
      .then((value) => active && setConfig(value))
      .catch(() => active && setError(GENERIC_BILLING_ERROR))
    return () => {
      active = false
    }
  }, [authorizationId, client])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!config || !consented || !reasonCode.trim()) return
    setError('')
    try {
      await client.recordCommercialResearchAttempt({
        authorizationId,
        configVersion: config.version,
        configDigest: config.digest,
        artifactDigest,
        questionVersion,
        choice,
        reasonCode: reasonCode.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      setSubmitted(true)
    } catch {
      setError(GENERIC_BILLING_ERROR)
    }
  }

  if (error && !config) return <p role="alert">{error}</p>
  if (!config) return <p role="status">Loading the private research offer…</p>
  if (submitted)
    return <p role="status">Your research response was recorded. No purchase was made.</p>

  const limits = config.fullGalleryLimits
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: config.currency })
  return (
    <main className="commercial-research" data-config-digest={config.digest}>
      <header>
        <p className="eyebrow">Private research · no purchase</p>
        <h1>Compare optional photo capacity</h1>
        <p>
          Every eligible store can publish on Free. Payment never affects publication, ranking,
          moderation, support, or shopper data.
        </p>
      </header>
      <section aria-labelledby="research-plans-heading">
        <h2 id="research-plans-heading">Exact research offer</h2>
        <dl>
          <div>
            <dt>Free</dt>
            <dd>Cover plus 5 gallery photos · no charge</dd>
          </div>
          <div>
            <dt>Gallery</dt>
            <dd>
              Cover plus 15 gallery photos · {money.format(config.galleryPriceCents / 100)}{' '}
              {config.currency} monthly
            </dd>
          </div>
          <div>
            <dt>Full Gallery</dt>
            <dd>
              Cover plus no plan-count cap · {money.format(config.fullGalleryPriceCents / 100)}{' '}
              {config.currency} monthly
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="research-terms-heading">
        <h2 id="research-terms-heading">Terms and limits</h2>
        <ul>
          <li>{config.taxMode}</li>
          <li>{config.firstChargeRule}</li>
          <li>{config.renewalRule}</li>
          <li>
            Refund policy {config.refundPolicyVersion}; support policy {config.supportPolicyVersion}
          </li>
          <li>
            Terms {config.termsVersion}; privacy {config.privacyVersion}
          </li>
          <li>
            Accepted files: {limits.acceptedFileTypes.join(', ')}; up to {limits.maxFileBytes} bytes
            and {limits.maxWidthPixels}×{limits.maxHeightPixels} pixels
          </li>
          <li>{limits.uploadRateRule}</li>
          <li>{limits.quotaOutageRule}</li>
          <li>{limits.moderationAbuseRule}</li>
          <li>{limits.reasonRecoveryAppealRule}</li>
          <li>{limits.paidServiceRemedy}</li>
        </ul>
      </section>
      <form onSubmit={submit}>
        <label>
          Which would you choose?
          <select
            value={choice}
            onChange={(event) => {
              if (isResearchChoice(event.target.value)) setChoice(event.target.value)
            }}
          >
            <option value="free">Free</option>
            <option value="gallery">Gallery</option>
            <option value="full_gallery">Full Gallery</option>
            <option value="refused">Prefer not to answer</option>
            <option value="abandoned">Stop the research task</option>
          </select>
        </label>
        <label>
          Primary reason
          <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
            <option value="photo_capacity">Photo capacity</option>
            <option value="price">Price</option>
            <option value="terms">Terms or lifecycle</option>
            <option value="stay_free">Free already meets my needs</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
          />{' '}
          Record this minimized research response
        </label>
        <button type="submit" disabled={!consented}>
          Record response
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
