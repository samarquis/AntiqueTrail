import { preflightAuthCallback } from './features/auth/callbackPreflight'

// This must stay ahead of every application import. Callback credentials leave the
// address bar before any module capable of networking or registering a worker loads.
const authCallback = preflightAuthCallback()

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
      <BrowserRouter>
        <App clients={composition?.clients} runtime={{ ...composition?.runtime, authCallback }} />
      </BrowserRouter>
    </StrictMode>,
  )
}

void bootstrap()
