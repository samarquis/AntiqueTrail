import type {
  OwnerIntakeAvailability,
  OwnerIntakeAvailabilityClient,
} from '../features/partners/ownerIntakeAvailability'

/** Synthetic-only adapter; production availability comes from the server projection. */
export function createReviewOwnerIntakeAvailabilityClient(
  state: string,
): OwnerIntakeAvailabilityClient {
  const availability: OwnerIntakeAvailability = {
    routeVisible: true,
    intakeAvailable: state === 'success',
    claimsAvailable: state === 'success',
  }
  return { getAvailability: async () => availability }
}
