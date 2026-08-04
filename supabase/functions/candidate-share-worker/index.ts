import { handleCandidateDeliveryWorker } from '../_shared/candidate-delivery-worker.ts'

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void }

Deno.serve(handleCandidateDeliveryWorker)
