import type {
  OwnerIntakeAvailability,
  OwnerIntakeAvailabilityClient,
} from '../features/partners/ownerIntakeAvailability'

/** Synthetic-only adapter; production availability comes from the server projection. */
export function createReviewOwnerIntakeAvailabilityClient(
  state: string,
): OwnerIntakeAvailabilityClient {
  // Review-state failures belong to the synthetic clients that own each
  // scenario. The availability adapter only keeps the routes mounted so the
  // harness can exercise those stateful fixtures without pretending they are
  // production authority responses.
  void state
  const availability: OwnerIntakeAvailability = {
    routeVisible: true,
    intakeAvailable: true,
    claimsAvailable: true,
  }
  return { getAvailability: async () => availability }
}
