import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStagedRecoveryToken,
  hasStagedRecoveryToken,
  isValidRecoveryPassword,
  stageRecoveryToken,
  takeStagedRecoveryToken,
} from './passwordRecoveryClient'

describe('dedicated password recovery memory', () => {
  beforeEach(() => {
    clearStagedRecoveryToken()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('holds only the scrubbed recovery token in module memory', () => {
    stageRecoveryToken('opaque-recovery-token')
    expect(hasStagedRecoveryToken()).toBe(true)
    expect(takeStagedRecoveryToken()).toBe('opaque-recovery-token')
    expect(hasStagedRecoveryToken()).toBe(false)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('enforces the registration password bounds without normalizing credentials', () => {
    expect(isValidRecoveryPassword('x'.repeat(11))).toBe(false)
    expect(isValidRecoveryPassword('x'.repeat(12))).toBe(true)
    expect(isValidRecoveryPassword('x'.repeat(128))).toBe(true)
    expect(isValidRecoveryPassword('x'.repeat(129))).toBe(false)
    expect(isValidRecoveryPassword('  x'.repeat(4))).toBe(true)
  })
})
