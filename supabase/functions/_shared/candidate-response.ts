export const MINIMUM_SEND_RESPONSE_MS = 500
export const SEND_ACCEPTED_STATUS = 202
export const SEND_ACCEPTED_BYTES = 256

const SEND_ACCEPTED_BODY = JSON.stringify({
  accepted: false,
  state: 'pending',
  message: 'If this email belongs to an eligible Antique Trail account, the idea will appear there.',
})

export function acceptedSendResponse() {
  return new Response(SEND_ACCEPTED_BODY.padEnd(SEND_ACCEPTED_BYTES, ' '), {
    status: SEND_ACCEPTED_STATUS,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function timed(
  operation: string,
  startedAt: number,
  response: Response,
  now: () => number = Date.now,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  if (operation === 'send') {
    const remaining = MINIMUM_SEND_RESPONSE_MS - (now() - startedAt)
    if (remaining > 0) await sleep(remaining)
  }
  return response
}
