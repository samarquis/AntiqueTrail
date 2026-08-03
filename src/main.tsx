import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import './app/styles.css'
import { configuredComposition } from './app/configuredComposition'

async function bootstrap() {
  const composition = await configuredComposition()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App clients={composition?.clients} runtime={composition?.runtime} />
      </BrowserRouter>
    </StrictMode>,
  )
}

void bootstrap()
