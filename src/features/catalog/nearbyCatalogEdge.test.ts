// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createPublicCatalogHandler } from '../../../supabase/functions/_shared/public-catalog'

const origin = 'https://antique-trail.vercel.app'
const nearbyArgs = () => ({
  p_q: 'lamp',
  p_category: 'lighting',
  p_area: null,
  p_device_latitude: 43.6532,
  p_device_longitude: -79.3832,
  p_device_radius_miles: 25,
})

const nearbyMapArgs = () => ({
  p_q: 'lamp',
  p_category: 'lighting',
  p_area: null,
  p_open_now: false,
  p_visited: true,
  p_saved: false,
  p_claimed: true,
  p_max_area_centroid_miles: null,
  p_state: 'ON',
  p_north: 44,
  p_south: 43,
  p_east: -78,
  p_west: -80,
  p_zoom: 10,
  p_limit: 40,
  p_device_latitude: 43.6532,
  p_device_longitude: -79.3832,
  p_device_radius_miles: 25,
})

function setup({
  publicTest = false,
  user = null,
  result = { data: [{ id: 'nearby-store' }], error: null },
}: {
  publicTest?: boolean
  user?: { id: string } | null
  result?: { data: unknown; error: { message: string } | null }
} = {}) {
  const rpc = vi.fn().mockResolvedValue(result)
  const gateway = vi.fn(() => ({ rpc }))
  const verify = vi.fn().mockResolvedValue(user)
  const handler = createPublicCatalogHandler(
    {
      url: 'https://uaupykgpegbseboklubv.supabase.co',
      anonKey: 'anon',
      gatewayJwt: 'server-only',
      allowedOrigin: origin,
      rateSalt: 'server-salt',
      publicTest,
    },
    { gateway, verify },
  )
  return { handler, gateway, verify, rpc }
}

function request(
  args: Record<string, unknown> = nearbyArgs(),
  token?: string,
  operation: string = 'nearby-list',
) {
  return new Request('https://uaupykgpegbseboklubv.supabase.co/functions/v1/public-catalog', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ operation, args }),
  })
}

const connection = { remoteAddr: { hostname: '192.0.2.10' } }

describe('nearby list Edge transport', () => {
  it('forwards the exact validated tuple and client filters, stripping a forged actor', async () => {
    const { handler, rpc, verify } = setup()
    const args = { ...nearbyArgs(), p_actor_user_id: 'forged-user' }
    const response = await handler(request(args), connection)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'nearby-store' }] })
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('synthetic_catalog_gateway_request', {
      p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_user_id: null,
      p_session_id: null,
      p_operation: 'nearby-list',
      p_args: nearbyArgs(),
    })
  })

  it('allows the manual area argument to be omitted', async () => {
    const { handler, rpc } = setup()
    const args: Record<string, unknown> = { ...nearbyArgs() }
    delete args.p_area

    expect((await handler(request(args), connection)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({ p_args: args }),
    )
  })

  it.each([
    [-90, -180, 5],
    [90, 180, 10],
    [0, 0, 25],
    [43.6532, -79.3832, 50],
  ])(
    'accepts finite coordinates and supported radius %s/%s/%s',
    async (latitude, longitude, radius) => {
      const { handler, rpc } = setup()
      const args = {
        ...nearbyArgs(),
        p_device_latitude: latitude,
        p_device_longitude: longitude,
        p_device_radius_miles: radius,
      }

      expect((await handler(request(args), connection)).status).toBe(200)
      expect(rpc).toHaveBeenCalledWith(
        'synthetic_catalog_gateway_request',
        expect.objectContaining({ p_operation: 'nearby-list', p_args: args }),
      )
    },
  )

  it.each([
    ['missing latitude', { ...nearbyArgs(), p_device_latitude: undefined }],
    ['missing longitude', { ...nearbyArgs(), p_device_longitude: undefined }],
    ['null latitude', { ...nearbyArgs(), p_device_latitude: null }],
    ['string latitude', { ...nearbyArgs(), p_device_latitude: '43.6' }],
    ['latitude out of range', { ...nearbyArgs(), p_device_latitude: 90.01 }],
    ['longitude out of range', { ...nearbyArgs(), p_device_longitude: -180.01 }],
    ['unsupported radius', { ...nearbyArgs(), p_device_radius_miles: 20 }],
    ['string radius', { ...nearbyArgs(), p_device_radius_miles: '25' }],
    ['missing radius', { ...nearbyArgs(), p_device_radius_miles: undefined }],
  ])('rejects %s before gateway creation, verification, or RPC', async (_name, args) => {
    const { handler, gateway, verify, rpc } = setup()
    const response = await handler(request(args), connection)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST' } })
    expect(gateway).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['manual area', { ...nearbyArgs(), p_area: 'Toronto' }],
    ['unknown argument', { ...nearbyArgs(), p_unexpected: true }],
  ])('rejects %s while allowing only the nearby client contract', async (_name, args) => {
    const { handler, gateway, verify } = setup()
    const response = await handler(request(args), connection)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST' } })
    expect(gateway).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })

  it('keeps verified actor and session binding on the synthetic gateway request', async () => {
    const token = `header.${btoa(JSON.stringify({ session_id: '99000000-0000-4000-8000-000000000011' }))}.signature`
    const { handler, rpc, verify } = setup({ user: { id: 'verified-user' } })
    const response = await handler(request(nearbyArgs(), token), connection)

    expect(response.status).toBe(200)
    expect(verify).toHaveBeenCalledExactlyOnceWith(token)
    expect(rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({
        p_operation: 'nearby-list',
        p_user_id: 'verified-user',
        p_session_id: '99000000-0000-4000-8000-000000000011',
      }),
    )
  })

  it('uses only the public-test gateway when that stage is selected', async () => {
    const { handler, rpc, verify } = setup({ publicTest: true })
    const response = await handler(request(), connection)

    expect(response.status).toBe(200)
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('public_test_catalog_gateway_request', {
      p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_operation: 'nearby-list',
      p_args: nearbyArgs(),
    })
  })

  it('maps generic SQL failure to 503 without falling back', async () => {
    const { handler, rpc } = setup({ result: { data: null, error: { message: 'PGRST202' } } })

    expect((await handler(request(), connection)).status).toBe(503)
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'synthetic_catalog_gateway_request',
      expect.any(Object),
    )
  })

  it('preserves forbidden and rate-limit responses without fallback', async () => {
    for (const [message, expectedStatus] of [
      ['synthetic_catalog_forbidden', 403],
      ['catalog_rate_limited', 429],
    ] as const) {
      const { handler, rpc } = setup({ result: { data: null, error: { message } } })
      const response = await handler(request(), connection)

      expect(response.status).toBe(expectedStatus)
      expect(rpc).toHaveBeenCalledTimes(1)
      if (expectedStatus === 429) expect(response.headers.get('Retry-After')).toBe('300')
    }
  })

  it('falls back only when the synthetic stage reports outside-stage', async () => {
    const { handler, rpc } = setup()
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'synthetic_catalog_outside_stage' } })
      .mockResolvedValueOnce({ data: [{ id: 'public-store' }], error: null })

    const response = await handler(request(), connection)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'public-store' }] })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]?.[0]).toBe('synthetic_catalog_gateway_request')
    expect(rpc.mock.calls[1]?.[0]).toBe('public_catalog_gateway_request')
    expect(rpc.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ p_operation: 'nearby-list', p_args: nearbyArgs() }),
    )
  })
})

describe('nearby map Edge transport', () => {
  it('forwards exact map filters and the separate validated device tuple', async () => {
    const { handler, rpc } = setup()
    const response = await handler(request(nearbyMapArgs(), undefined, 'nearby-map'), connection)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'nearby-store' }] })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('synthetic_catalog_gateway_request', {
      p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_user_id: null,
      p_session_id: null,
      p_operation: 'nearby-map',
      p_args: nearbyMapArgs(),
    })
  })

  it('binds the map actor only from a verified user and strips forged actor input', async () => {
    const args = { ...nearbyMapArgs(), p_actor_user_id: 'forged-user' }
    const unsigned = setup()
    await unsigned.handler(request(args, undefined, 'nearby-map'), connection)

    expect(unsigned.rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({ p_user_id: null, p_args: nearbyMapArgs() }),
    )

    const unverified = setup()
    await unverified.handler(request(args, 'unverified-token', 'nearby-map'), connection)

    expect(unverified.verify).toHaveBeenCalledExactlyOnceWith('unverified-token')
    expect(unverified.rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({ p_user_id: null, p_args: nearbyMapArgs() }),
    )

    const token = `header.${btoa(JSON.stringify({ session_id: '99000000-0000-4000-8000-000000000011' }))}.signature`
    const verified = setup({ user: { id: 'verified-user' } })
    await verified.handler(request(args, token, 'nearby-map'), connection)

    expect(verified.rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({
        p_user_id: 'verified-user',
        p_session_id: '99000000-0000-4000-8000-000000000011',
        p_args: { ...nearbyMapArgs(), p_actor_user_id: 'verified-user' },
      }),
    )
  })

  it('binds map actor input only from a verified user', async () => {
    const token = `header.${btoa(JSON.stringify({ session_id: '99000000-0000-4000-8000-000000000011' }))}.signature`
    const { handler, rpc } = setup({ user: { id: 'verified-user' } })
    const response = await handler(
      request({ p_visited: true, p_actor_user_id: 'forged-user' }, token, 'map'),
      connection,
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({
        p_operation: 'map',
        p_user_id: 'verified-user',
        p_session_id: '99000000-0000-4000-8000-000000000011',
        p_args: { p_visited: true, p_actor_user_id: 'verified-user' },
      }),
    )
  })

  it('denies public-test nearby maps before any RPC', async () => {
    const { handler, rpc } = setup({ publicTest: true })
    const response = await handler(request(nearbyMapArgs(), undefined, 'nearby-map'), connection)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: { code: 'MAP_UNAVAILABLE' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['missing latitude', { ...nearbyMapArgs(), p_device_latitude: undefined }],
    ['null longitude', { ...nearbyMapArgs(), p_device_longitude: null }],
    ['invalid latitude', { ...nearbyMapArgs(), p_device_latitude: 90.01 }],
    ['invalid longitude', { ...nearbyMapArgs(), p_device_longitude: -180.01 }],
    ['unsupported radius', { ...nearbyMapArgs(), p_device_radius_miles: 20 }],
  ])('rejects malformed device tuple: %s', async (_name: string, args: Record<string, unknown>) => {
    const { handler, gateway, verify, rpc } = setup()
    const response = await handler(request(args, undefined, 'nearby-map'), connection)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST' } })
    expect(gateway).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['manual area', { ...nearbyMapArgs(), p_area: 'Toronto' }],
    ['manual centroid radius', { ...nearbyMapArgs(), p_max_area_centroid_miles: 10 }],
    ['unknown argument', { ...nearbyMapArgs(), p_unexpected: true }],
  ])('rejects %s before gateway access', async (_name: string, args: Record<string, unknown>) => {
    const { handler, gateway, verify, rpc } = setup()
    const response = await handler(request(args, undefined, 'nearby-map'), connection)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_REQUEST' } })
    expect(gateway).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['synthetic_catalog_map_disabled', 503, 'MAP_UNAVAILABLE'],
    ['synthetic_catalog_forbidden', 403, 'ALPHA_AUTH_REQUIRED'],
    ['catalog_rate_limited', 429, 'RATE_LIMITED'],
    ['PGRST202', 503, 'CATALOG_UNAVAILABLE'],
  ])('keeps %s denial in the synthetic stage without fallback', async (message, status, code) => {
    const { handler, rpc } = setup({ result: { data: null, error: { message } } })
    const response = await handler(request(nearbyMapArgs(), undefined, 'nearby-map'), connection)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { code } })
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({ p_operation: 'nearby-map', p_args: nearbyMapArgs() }),
    )
  })

  it('falls back unchanged only for the explicit outside-stage error', async () => {
    const { handler, rpc } = setup()
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'synthetic_catalog_outside_stage' } })
      .mockResolvedValueOnce({ data: [{ id: 'regional-store' }], error: null })

    const response = await handler(request(nearbyMapArgs(), undefined, 'nearby-map'), connection)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'regional-store' }] })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1]?.[0]).toBe('public_catalog_gateway_request')
    expect(rpc.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ p_operation: 'nearby-map', p_args: nearbyMapArgs() }),
    )
  })
})
