import type { ReactNode } from 'react'

export const OWNER_ACQUISITION_SECTION_ORDER = [
  'audience-area',
  'shopper-owner-value',
  'shopper-journey',
  'fact-controls',
  'eligibility',
  'claim-or-add',
  'approval',
  'free',
  'trust',
] as const

export const OWNER_ACQUISITION_PROHIBITED_COPY = [
  /\$\s*\d|\b(price|pricing|premium|upgrade|per month|monthly plan|annual plan)\b/i,
  /\b(waitlist|join (our|the) list|email updates)\b/i,
  /\b(testimonial|owners love|trusted by \d+|\d+ stores use)\b/i,
  /\b(rank higher|boost ranking|priority placement)\b/i,
  /\b(roi|return on investment|increase (sales|revenue|traffic)|guaranteed (sales|traffic))\b/i,
  /\b(limited time|act now|hurry|spots? left|last chance)\b/i,
  /\b(instant verification|same-day approval|fast approval|review(ed)? within \d+)\b/i,
] as const

export function assertOwnerAcquisitionCopy(copy: string) {
  const prohibited = OWNER_ACQUISITION_PROHIBITED_COPY.find((pattern) => pattern.test(copy))
  if (prohibited) throw new Error(`Prohibited owner-acquisition claim: ${prohibited.source}`)
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="owner-acquisition__section" data-owner-section={id}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function OwnerAcquisitionContent({
  action,
  canonicalSiteUrl,
}: {
  action: ReactNode
  canonicalSiteUrl: string
}) {
  const canonical = (path: string) => new URL(path, `${canonicalSiteUrl}/`).href
  return (
    <article className="owner-acquisition">
      <header className="owner-acquisition__hero" data-owner-section="audience-area">
        <p className="eyebrow">For eligible Topeka antique-store owners and managers</p>
        <h1>Help antique shoppers find your store—and make it part of the trip.</h1>
      </header>

      <Section id="shopper-owner-value" title="Useful to shoppers, manageable for owners">
        <p className="lede">
          Antique Trail helps shoppers find Topeka antique stores, check current information, and
          build a practical day before stores close. Owners can keep ordinary store information
          current without paying for the complete Free service.
        </p>
      </Section>

      <Section id="shopper-journey" title="From browsing to a planned stop">
        <ol>
          <li>Browse nearby antique and vintage stores.</li>
          <li>Open Store Details and see when important information was checked.</li>
          <li>Add a store to a trip and place it in the day's plan.</li>
          <li>Open external navigation when it is time to travel.</li>
        </ol>
      </Section>

      <Section id="fact-controls" title="What you can keep current">
        <p>
          You can maintain ordinary details such as hours, website, description, and official social
          links. Sensitive facts and photos are reviewed before publication. Participation never
          changes ranking, ratings, moderation, or access to shopper data.
        </p>
      </Section>

      <Section id="eligibility" title="Who is eligible">
        <p>
          This launch is limited to brick-and-mortar stores inside Topeka city limits whose primary
          inventory is antiques or vintage goods and that have recurring public hours. Event-only
          markets and general thrift or consignment stores without that primary focus are not
          eligible. Multi-location and unsupported businesses use the support path instead of a
          partially working application.
        </p>
      </Section>

      <Section id="claim-or-add" title="Claim the listing or ask us to add it">
        <p>
          Find your existing listing first and claim it. If the store is missing, use the add-store
          path; the two paths use the same approval boundary.
        </p>
      </Section>

      <Section id="approval" title="Approval comes before publication">
        <p>
          A verified-email account, MFA, authority evidence, and Administrator review are required.
          Starting or submitting an application does not publish a store or create store access.
        </p>
        {action}
      </Section>

      <Section id="free" title="The complete Free service">
        <p>
          Free plan available · No sales commission · Keep key store details current. Payment is not
          required for publication, support, moderation, verification, ranking, or shopper access.
        </p>
        <p>
          An approved eligible store receives its listing and Store Portal, a cover image and up to
          five approved gallery images. Free continues at no charge while the listing remains
          eligible and current; a listing is not removed for nonpayment.
        </p>
      </Section>

      <Section id="trust" title="Trust, privacy, and support">
        <p>
          Learn how the service is operated and get help through the current{' '}
          <a href={canonical('/help')}>support</a>, <a href={canonical('/security')}>security</a>,{' '}
          <a href={canonical('/privacy')}>privacy</a>, <a href={canonical('/terms')}>terms</a>, and{' '}
          <a href={canonical('/status')}>status</a> paths.
        </p>
      </Section>
    </article>
  )
}
