import { handleCandidate } from '../_shared/candidate-server.ts'
declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void }
Deno.serve((request) => handleCandidate('extract', request))
