export interface PartnerCorsBoundary {
  allowed: boolean
  headers: Record<string, string>
}

export function partnerCors(request: Request, appOrigin?: string): PartnerCorsBoundary {
  const origin = request.headers.get('origin')
  const allowed = Boolean(appOrigin && origin && origin === appOrigin)
  return {
    allowed,
    headers: {
      Vary: 'Authorization, Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin! } : {}),
    },
  }
}

export function partnerPreflight(boundary: PartnerCorsBoundary): Response {
  return new Response(null, {
    status: boundary.allowed ? 204 : 403,
    headers: {
      ...boundary.headers,
      ...(boundary.allowed
        ? {
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
            'Access-Control-Max-Age': '600',
          }
        : {}),
    },
  })
}
