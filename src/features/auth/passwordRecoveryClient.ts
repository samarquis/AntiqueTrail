export const PASSWORD_RECOVERY_MIN_LENGTH = 1
export const PASSWORD_RECOVERY_MAX_LENGTH = 8
export const PASSWORD_RECOVERY_ERROR =
  "We couldn't update your password. Try again or request a new recovery link."
export const PASSWORD_RECOVERY_SUCCESS = 'Password updated. Sign in with your new password.'
export const PASSWORD_RECOVERY_LENGTH_ERROR = 'Use 1 through 8 characters.'
export const PASSWORD_RECOVERY_MISMATCH_ERROR = 'Passwords do not match.'

let pendingRecoveryToken: string | null = null
let pendingRecoveryGeneration = 0

export function stageRecoveryToken(tokenHash: string): void {
  pendingRecoveryGeneration += 1
  pendingRecoveryToken = tokenHash
}

/** Cleanup owns only the token generation present when the page effect attached. */
export function captureStagedRecoveryCleanup(): () => void {
  const generation = pendingRecoveryGeneration
  return () => {
    if (generation === pendingRecoveryGeneration) clearStagedRecoveryToken()
  }
}

export function hasStagedRecoveryToken(): boolean {
  return pendingRecoveryToken !== null
}

export function takeStagedRecoveryToken(): string | null {
  const token = pendingRecoveryToken
  pendingRecoveryToken = null
  return token
}

export function clearStagedRecoveryToken(): void {
  pendingRecoveryToken = null
}

export function isValidRecoveryPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_RECOVERY_MIN_LENGTH &&
    password.length <= PASSWORD_RECOVERY_MAX_LENGTH
  )
}
