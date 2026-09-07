export const OWNER_INTAKE_AVAILABILITY_ERROR = 'Owner acquisition is unavailable. Please try again.'

export interface OwnerIntakeAvailability {
  routeVisible: boolean
  intakeAvailable: boolean
  claimsAvailable: boolean
}

export interface OwnerIntakeAvailabilityClient {
  getAvailability(): Promise<OwnerIntakeAvailability>
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(OWNER_INTAKE_AVAILABILITY_ERROR)
  return Object.fromEntries(Object.entries(value))
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error(OWNER_INTAKE_AVAILABILITY_ERROR)
  return value
}

export function parseOwnerIntakeAvailability(value: unknown): OwnerIntakeAvailability {
  const result = object(value)
  return {
    routeVisible: boolean(result.routeVisible),
    intakeAvailable: boolean(result.intakeAvailable),
    claimsAvailable: boolean(result.claimsAvailable),
  }
}

export function createOwnerIntakeAvailabilityClient(
  rpc: (name: 'owner_intake_availability') => Promise<{
    data: unknown
    error: unknown | null
  }>,
): OwnerIntakeAvailabilityClient {
  return {
    async getAvailability() {
      try {
        const result = await rpc('owner_intake_availability')
        if (result.error || result.data === null || result.data === undefined)
          throw new Error(OWNER_INTAKE_AVAILABILITY_ERROR)
        return parseOwnerIntakeAvailability(result.data)
      } catch {
        throw new Error(OWNER_INTAKE_AVAILABILITY_ERROR)
      }
    },
  }
}

export const unavailableOwnerIntakeAvailabilityClient: OwnerIntakeAvailabilityClient = {
  getAvailability: async () => {
    throw new Error(OWNER_INTAKE_AVAILABILITY_ERROR)
  },
}
