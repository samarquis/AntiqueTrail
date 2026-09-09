import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { AdminClient } from './adminClient'
import type { AdminAuditEntry } from './types'
import { GENERIC_ADMIN_FAILURE } from './boundary'
import { AdminAuditProvider, useAuditSelection } from './auditContext'

// Keep the originating record mounted so Back preserves its filter, draft, and selection.
function AuditRouteContents({ children, audit }: { children: ReactNode; audit: ReactNode }) {
  const location = useLocation()
  const selection = useAuditSelection()?.selection
  const showingAudit = location.pathname === '/admin/audit' && Boolean(selection)
  return (
    <>
      <div hidden={showingAudit}>
        <Routes location={showingAudit ? selection?.returnTo : location}>{children}</Routes>
      </div>
      {showingAudit && audit}
    </>
  )
}

export function AdminAuditRoutes(props: { children: ReactNode; audit: ReactNode }) {
  return (
    <AdminAuditProvider>
      <AuditRouteContents {...props} />
    </AdminAuditProvider>
  )
}

export function ViewAuditButton({
  access,
  label,
  returnTo,
}: {
  access?: string
  label: string
  returnTo: '/admin' | '/admin/access'
}) {
  const context = useAuditSelection()
  const navigate = useNavigate()
  if (!context || !access) return null
  return (
    <button
      type="button"
      data-preserve-route-focus
      onClick={(event) => {
        const trigger = event.currentTarget
        context.select({ access, label, returnTo, returnFocus: () => trigger.focus() })
        navigate('/admin/audit')
      }}
    >
      View Audit for {label}
    </button>
  )
}

export function RecordAuditPage({ client }: { client: AdminClient }) {
  const selection = useAuditSelection()?.selection
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    access: string
    attempt: number
    entries: AdminAuditEntry[] | null
  } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    return () => selection?.returnFocus?.()
  }, [selection])
  useEffect(() => {
    if (!selection) return
    let active = true
    void client.readAudit(selection.access).then(
      (entries) => {
        if (active) setResult({ access: selection.access, attempt, entries })
      },
      () => {
        if (active) setResult({ access: selection.access, attempt, entries: null })
      },
    )
    return () => {
      active = false
    }
  }, [client, selection, attempt])
  const current =
    result?.access === selection?.access && result?.attempt === attempt ? result : null
  return (
    <main>
      <h1 tabIndex={-1} ref={heading}>
        View Audit
      </h1>
      <Link to={selection?.returnTo ?? '/admin'}>
        Back to {selection?.returnTo === '/admin/access' ? 'Access & Safety' : 'Review'}
      </Link>
      {!selection ? (
        <p role="alert">{GENERIC_ADMIN_FAILURE} Open View Audit from an authorized record.</p>
      ) : !current ? (
        <p role="status">Loading record audit…</p>
      ) : current.entries === null ? (
        <>
          <p role="alert">{GENERIC_ADMIN_FAILURE} Reopen the record if your access has expired.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry audit
          </button>
        </>
      ) : (
        <section aria-label="Record audit">
          <h2>{selection.label}</h2>
          <p>Up to 100 most recent events from the last two years, in time order.</p>
          {current.entries.length === 0 ? (
            <p role="status">No audit events for this record.</p>
          ) : (
            <ol>
              {current.entries.map((entry, index) => (
                <li key={index}>
                  <p>
                    {entry.action.replaceAll('_', ' ')} — {entry.outcome}
                  </p>
                  <time dateTime={entry.occurredAt}>
                    {new Date(entry.occurredAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  )
}
