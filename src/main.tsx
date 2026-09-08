import { preflightAuthCallback } from './features/auth/callbackPreflight'
import { preflightBreakGlassReview } from './features/reviews/breakGlassReviewClient'
<<<<<<< HEAD
import {
  preflightReviewerCapability,
  takePreflightReviewerCapability,
} from './features/reviews/reviewerCredentialBrowser'
import { preflightIndependentAppeal } from './features/reviews/independentAppealClient'

// This must stay ahead of every application import. Callback credentials leave the
// address bar before any module capable of networking or registering a worker loads.
const authCallback = preflightAuthCallback()
const breakGlassReviewToken = preflightBreakGlassReview()
<<<<<<< HEAD
preflightReviewerCapability()
const reviewerCapabilityToken = takePreflightReviewerCapability()
const independentAppealToken = preflightIndependentAppeal()

async function bootstrap() {
  const [{ StrictMode }, { createRoot }, { BrowserRouter }, { default: App }, compositionModule] =
    await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('react-router-dom'),
      import('./app/App'),
      import('./app/configuredComposition'),
      import('./app/styles.css'),
    ])
  const { configuredComposition } = compositionModule
  const composition = await configuredComposition()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App
          clients={composition?.clients}
<<<<<<< HEAD
          runtime={{
            ...composition?.runtime,
            authCallback,
            breakGlassReviewToken,
            reviewerCapabilityToken,
            independentAppealToken,
          }}
        />
      </BrowserRouter>
    </StrictMode>,
  )
}

void bootstrap()
