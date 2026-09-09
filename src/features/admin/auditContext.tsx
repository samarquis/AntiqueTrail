import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth'

interface Selection {
  access: string
  label: string
  returnTo: '/admin' | '/admin/access'
  returnFocus?: () => void
}

const AuditContext = createContext<{
  selection: Selection | null
  select: (selection: Selection) => void
} | null>(null)

export function AdminAuditProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const key = session?.accessToken ?? 'signed-out'
  const [stored, setStored] = useState<{ key: string; selection: Selection } | null>(null)
  useEffect(() => {
    setStored(null)
  }, [key])
  return (
    <AuditContext.Provider
      value={{
        selection: stored?.key === key ? stored.selection : null,
        select: (selection) => setStored({ key, selection }),
      }}
    >
      {children}
    </AuditContext.Provider>
  )
}

export function useAuditSelection() {
  return useContext(AuditContext)
}
