import { describe, expect, it, vi } from 'vitest'
import {
  createOwnerIntakeAvailabilityClient,
  OWNER_INTAKE_AVAILABILITY_ERROR,
  parseOwnerIntakeAvailability,
} from './ownerIntakeAvailability'

describe('owner intake availability client', () => {
  it('parses the minimum server-owned presentation projection', async () => {
    const rpc = vi.fn(async () => ({
      data: { routeVisible: true, intakeAvailable: true, claimsAvailable: false },
      error: null,
    }))
    const client = createOwnerIntakeAvailabilityClient(rpc)

    await expect(client.getAvailability()).resolves.toEqual({
      routeVisible: true,
      intakeAvailable: true,
      claimsAvailable: false,
    })
    expect(rpc).toHaveBeenCalledWith('owner_intake_availability')
  })

  it('fails closed for transport, null, and malformed responses', async () => {
    const client = createOwnerIntakeAvailabilityClient(
      vi.fn(async () => ({ data: { routeVisible: true }, error: null })),
    )
    await expect(client.getAvailability()).rejects.toThrow(OWNER_INTAKE_AVAILABILITY_ERROR)
    expect(() => parseOwnerIntakeAvailability(null)).toThrow(OWNER_INTAKE_AVAILABILITY_ERROR)
  })
})
