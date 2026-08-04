import { handleCandidate } from '../_shared/candidate-server.ts'
import type { CandidateConnection } from '../_shared/candidate-server.ts'
declare const Deno: {
  serve(handler: (request: Request, info: { remoteAddr: CandidateConnection }) => Promise<Response>): void
}
Deno.serve((request, info) => handleCandidate('send', request, info.remoteAddr))
