import type { ReactNode } from 'react'

export const OWNER_ACQUISITION_SECTION_ORDER = [
  'audience',
  'journey',
  'controls',
  'eligibility',
  'approval',
  'free',
  'trust',
] as const

export const OWNER_ACQUISITION_PROHIBITED_COPY = [
  'most popular',
  'guaranteed traffic',
  'guaranteed sales',
  'verified owner',
  'join the waitlist',
  'limited time',
] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="owner-acquisition__section" data-owner-section={id}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function OwnerAcquisitionContent({ action }: { action: ReactNode }) {
  return (
    <article className="owner-acquisition">
      <header className="owner-acquisition__hero" data-owner-section="audience">
        <p className="eyebrow">For eligible Topeka antique-store owners and managers</p>
        <h1>Help antique shoppers find your store—and make it part of the trip.</h1>
        <p className="lede">
          Antique Trail helps shoppers find Topeka antique stores, check current information, and
          build a practical day before stores close.
        </p>
      </header>

      <Section id="journey" title="From browsing to a planned stop">
        <ol>
          <li>Browse nearby antique and vintage stores.</li>
          <li>Open Store Details and see when important information was checked.</li>
          <li>Add a store to a trip and place it in the day's plan.</li>
          <li>Open external navigation when it is time to travel.</li>
        </ol>
      </Section>

      <Section id="controls" title="What you can keep current">
        <p>
          You can maintain ordinary details such as hours, website, description, and official social
          links. Sensitive facts and photos are reviewed before publication. Participation never
          changes ranking, ratings, moderation, or access to shopper data.
        </p>
      </Section>

      <Section id="eligibility" title="Claim an existing store or ask us to add one">
        <p>
          This launch is limited to eligible antique and vintage stores in Topeka. Find your
          existing listing first; if it is missing, use the add-store path. Multi-location and
          unsupported businesses use the support path instead of a partially working application.
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
      </Section>

      <Section id="trust" title="Trust, privacy, and support">
        <p>
          Learn how the service is operated and get help through the current{' '}
          <a href="/help">support</a>, <a href="/security">security</a>,{' '}
          <a href="/privacy">privacy</a>, <a href="/terms">terms</a>, and{' '}
          <a href="/status">status</a> paths.
        </p>
      </Section>
    </article>
  )
}
