import type {
  OwnerIntakeAvailability,
  OwnerIntakeAvailabilityClient,
} from '../features/partners/ownerIntakeAvailability'

/** Synthetic-only adapter; production availability comes from the server projection. */
export function createReviewOwnerIntakeAvailabilityClient(
  state: string,
): OwnerIntakeAvailabilityClient {
  // Review-state failures belong to the synthetic clients that own each
  // scenario. The availability adapter keeps routes mounted for every
  // scenario while preserving the closed-intake state outside success.
  const availability: OwnerIntakeAvailability = {
    routeVisible: true,
    intakeAvailable: state === 'success',
    claimsAvailable: true,
  }
  return { getAvailability: async () => availability }
}
