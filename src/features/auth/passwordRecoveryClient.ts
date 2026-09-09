export const PASSWORD_RECOVERY_MIN_LENGTH = 12
export const PASSWORD_RECOVERY_MAX_LENGTH = 128
export const PASSWORD_RECOVERY_ERROR =
  "We couldn't update your password. Try again or request a new recovery link."
export const PASSWORD_RECOVERY_SUCCESS = 'Password updated. Sign in with your new password.'
export const PASSWORD_RECOVERY_LENGTH_ERROR = 'Use 12 through 128 characters.'
export const PASSWORD_RECOVERY_MISMATCH_ERROR = 'Passwords do not match.'

let pendingRecoveryToken: string | null = null

export function stageRecoveryToken(tokenHash: string): void {
  pendingRecoveryToken = tokenHash
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
