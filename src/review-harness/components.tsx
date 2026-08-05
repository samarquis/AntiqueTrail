import { Link, useLocation } from 'react-router-dom'
import type { ReviewHarnessRuntime, ReviewStateId } from './types'

function harnessUrl(path: string, scenario: string, state: ReviewStateId) {
  const url = new URL(path, 'http://review.local')
  url.searchParams.set('reviewAs', scenario)
  url.searchParams.set('reviewState', state)
  return `${url.pathname}${url.search}`
}

export function ReviewHarnessBanner({ runtime }: { runtime: ReviewHarnessRuntime }) {
  return (
    <aside className="page-card" aria-label="Local review harness">
      <strong>Local review:</strong> {runtime.scenario.label} · {runtime.state}{' '}
      <Link to={harnessUrl('/review', runtime.scenario.id, runtime.state)}>Switch or reset</Link>
    </aside>
  )
}

function StateFixture({ state }: { state: ReviewStateId }) {
  if (state === 'loading') return <p role="status">Loading deterministic review fixture…</p>
  if (state === 'empty') return <p role="status">No items in this deterministic fixture.</p>
  if (state === 'error')
    return <p role="alert">The deterministic fixture could not be loaded. Try again.</p>
  if (state === 'blocked')
    return <p role="status">This operation is blocked by a required release gate.</p>
  if (state === 'permission-denied')
    return <p role="alert">You do not have permission to view this fixture.</p>
  return <p role="status">Deterministic fixture loaded successfully.</p>
}

export function ReviewHarnessPage({ runtime }: { runtime: ReviewHarnessRuntime }) {
  const location = useLocation()
  const currentPath = `${location.pathname}${location.search}`
  async function resetFixtures() {
    window.localStorage.clear()
    window.sessionStorage.clear()
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.deleteDatabase('antique-trail-private-trip-v1')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
    window.location.assign('/review?reviewAs=anonymous&reviewState=success')
  }
  return (
    <main>
      <header>
        <p className="eyebrow">Local-only review tools</p>
        <h1>Human review harness</h1>
        <p>
          Choose a synthetic identity and state. Changing either value reloads an isolated,
          deterministic in-memory session; no credential or provider call is used.
        </p>
      </header>

      <section className="page-card" aria-labelledby="review-identity-heading">
        <h2 id="review-identity-heading">1. Choose an identity</h2>
        <nav aria-label="Review identities">
          {runtime.scenarios.map((scenario) => (
            <a
              className="button"
              href={harnessUrl('/review', scenario.id, runtime.state)}
              aria-current={scenario.id === runtime.scenario.id ? 'page' : undefined}
              key={scenario.id}
            >
              {scenario.label}
            </a>
          ))}
        </nav>
      </section>

      <section className="page-card" aria-labelledby="review-state-heading">
        <h2 id="review-state-heading">2. Choose a fixture state</h2>
        <nav aria-label="Review fixture states">
          {runtime.states.map((state) => (
            <a
              className="button"
              href={harnessUrl('/review', runtime.scenario.id, state)}
              aria-current={state === runtime.state ? 'page' : undefined}
              key={state}
            >
              {state.replace('-', ' ')}
            </a>
          ))}
        </nav>
        <div aria-label="Selected fixture result">
          <StateFixture state={runtime.state} />
        </div>
      </section>

      <section className="page-card" aria-labelledby="review-scenario-heading">
        <h2 id="review-scenario-heading">3. Review this scenario</h2>
        <dl>
          <dt>Role</dt>
          <dd>{runtime.scenario.role}</dd>
          <dt>Synthetic identity</dt>
          <dd>{runtime.scenario.identity}</dd>
          <dt>Seeded coverage</dt>
          <dd>{runtime.scenario.fixtureSummary}</dd>
        </dl>
        <h3>Allowed review paths</h3>
        <ul>
          {runtime.scenario.destinations.map((destination) => (
            <li key={destination.path}>
              <a href={harnessUrl(destination.path, runtime.scenario.id, runtime.state)}>
                {destination.label}
              </a>{' '}
              — {destination.purpose}
            </li>
          ))}
        </ul>
        <h3>Denial checks</h3>
        <ul>
          {runtime.scenario.deniedDestinations.map((destination) => (
            <li key={destination.path}>
              <a href={harnessUrl(destination.path, runtime.scenario.id, 'permission-denied')}>
                {destination.label}
              </a>{' '}
              — {destination.purpose}
            </li>
          ))}
        </ul>
      </section>

      <section className="page-card" aria-labelledby="review-reset-heading">
        <h2 id="review-reset-heading">4. Reset</h2>
        <p>Reset returns to anonymous success and discards this tab's in-memory session.</p>
        <button className="button" type="button" onClick={() => void resetFixtures()}>
          Reset review fixtures
        </button>
        <p>
          Current reproducible URL: <code style={{ overflowWrap: 'anywhere' }}>{currentPath}</code>
        </p>
      </section>
    </main>
  )
}
