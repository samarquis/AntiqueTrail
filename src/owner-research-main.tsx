import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import {
  GENERIC_OWNER_RESEARCH_DENIAL,
  OwnerResearchPage,
  createOwnerResearchClient,
} from './features/readiness'
import './owner-research.css'

function unavailable() {
  return (
    <main className="owner-research-shell">
      <h1>Research experience unavailable</h1>
      <p role="alert">{GENERIC_OWNER_RESEARCH_DENIAL}</p>
    </main>
  )
}

async function artifactDigest() {
  if (import.meta.env.DEV) return `sha256:${'a'.repeat(64)}`
  const response = await fetch('/owner-research-manifest.json', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)
  const manifest = (await response.json()) as { kind?: unknown; contentDigest?: unknown }
  if (
    manifest.kind !== 'antique-trail-owner-research' ||
    typeof manifest.contentDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(manifest.contentDigest)
  )
    throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)
  return manifest.contentDigest
}

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const cohortKey = import.meta.env.VITE_OWNER_RESEARCH_COHORT_KEY
  const canonicalSiteUrl = import.meta.env.VITE_CANONICAL_SITE_URL
  const validPath =
    window.location.pathname === '/for-stores' ||
    (import.meta.env.DEV && window.location.pathname === '/owner-research.html')
  if (!validPath || !url || !key || !cohortKey || !canonicalSiteUrl) {
    root.render(<StrictMode>{unavailable()}</StrictMode>)
    return
  }

  const supabase = createClient(url, key, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  })
  let digest: string
  try {
    digest = await artifactDigest()
  } catch {
    root.render(<StrictMode>{unavailable()}</StrictMode>)
    return
  }
  const client = createOwnerResearchClient(
    {
      async rpc(name, args) {
        const result = await supabase.rpc(name, args)
        return { data: result.data, error: result.error }
      },
    },
    { artifactDigest: digest, cohortKey },
  )
  root.render(
    <StrictMode>
      <OwnerResearchPage
        client={client}
        authenticate={async (email, password) => {
          const result = await supabase.auth.signInWithPassword({ email, password })
          if (result.error) throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)
        }}
        canonicalSiteUrl={canonicalSiteUrl}
      />
    </StrictMode>,
  )
}

void bootstrap()
