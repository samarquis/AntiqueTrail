import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { OwnerTeamRole } from './ownerClient'

type OwnerStoreRoleContextValue = {
  role: OwnerTeamRole | null
  setRole(role: OwnerTeamRole | null): void
}

const OwnerStoreRoleContext = createContext<OwnerStoreRoleContextValue>({
  role: null,
  setRole: () => undefined,
})

export function OwnerStoreRoleProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [selection, setSelection] = useState<{ userId: string; role: OwnerTeamRole } | null>(null)

  useEffect(() => {
    setSelection((current) => (current?.userId === session?.userId ? current : null))
  }, [session?.userId])

  const setRole = (role: OwnerTeamRole | null) => {
    setSelection(role && session ? { userId: session.userId, role } : null)
  }

  return (
    <OwnerStoreRoleContext.Provider
      value={{
        role: selection && selection.userId === session?.userId ? selection.role : null,
        setRole,
      }}
    >
      {children}
    </OwnerStoreRoleContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOwnerStoreRole() {
  return useContext(OwnerStoreRoleContext)
}
