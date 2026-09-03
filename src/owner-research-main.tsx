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

function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const artifactDigest = import.meta.env.VITE_OWNER_RESEARCH_ARTIFACT_DIGEST
  const cohortKey = import.meta.env.VITE_OWNER_RESEARCH_COHORT_KEY
  const validPath =
    window.location.pathname === '/for-stores' ||
    (import.meta.env.DEV && window.location.pathname === '/owner-research.html')
  if (!validPath || !url || !key || !artifactDigest || !cohortKey) {
    root.render(<StrictMode>{unavailable()}</StrictMode>)
    return
  }

  const supabase = createClient(url, key, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  })
  const client = createOwnerResearchClient(
    {
      async rpc(name, args) {
        const result = await supabase.rpc(name, args)
        return { data: result.data, error: result.error }
      },
    },
    { artifactDigest, cohortKey },
  )
  root.render(
    <StrictMode>
      <OwnerResearchPage
        client={client}
        authenticate={async (email, password) => {
          const result = await supabase.auth.signInWithPassword({ email, password })
          if (result.error) throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)
        }}
      />
    </StrictMode>,
  )
}

bootstrap()
