import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  isStandaloneDisplayMode,
  listenForInstallPrompt,
  type InstallPromptEvent,
} from './installCapabilities'

export function InstallPage() {
  const [installed, setInstalled] = useState(isStandaloneDisplayMode)
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const removePromptListener = listenForInstallPrompt(setPromptEvent)
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      setMessage('Antique Trail is installed on this device.')
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      removePromptListener()
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent || pending) return
    setPending(true)
    setMessage('')
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      setPromptEvent(null)
      setMessage(
        choice.outcome === 'accepted'
          ? 'Installation started. Follow your browser’s confirmation steps.'
          : 'Installation was declined. The instructions below are still available.',
      )
    } catch {
      setPromptEvent(null)
      setMessage('The browser could not open its install prompt. Use the instructions below.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="install-heading">
        <h1 id="install-heading">Install Antique Trail</h1>
        {installed ? (
          <p role="status">Antique Trail is already installed on this device.</p>
        ) : (
          <>
            {promptEvent && (
              <button
                className="button"
                type="button"
                disabled={pending}
                onClick={() => void install()}
              >
                {pending ? 'Opening install prompt…' : 'Install Antique Trail'}
              </button>
            )}
            {message && <p role="status">{message}</p>}
            <p>Installation is optional. You can keep using Antique Trail in your browser.</p>
            <h2>Computer</h2>
            <ol>
              <li>
                Open Antique Trail in Chrome or another browser that offers web-app installation.
              </li>
              <li>
                Use the browser menu and choose its Install page or Add to home screen option.
              </li>
              <li>Follow the browser’s confirmation steps.</li>
            </ol>
            <h2>iPhone or iPad</h2>
            <ol>
              <li>Open Antique Trail in Safari.</li>
              <li>Tap Share, then Add to Home Screen.</li>
              <li>Tap Add; choose Open as Web App when Safari offers it.</li>
            </ol>
            <p>
              If your browser does not offer installation, bookmark this page instead. No automatic
              install prompt will interrupt browsing or sign-in.
            </p>
          </>
        )}
        <Link className="button" to="/more">
          Back to More
        </Link>
      </section>
    </main>
  )
}
