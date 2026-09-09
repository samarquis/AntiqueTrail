import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const STORE_A = '00000000-0000-4000-8000-000000001001'
const STORE_B = '00000000-0000-4000-8000-000000001002'
export function createExecutor(service) {
  const { run, request, sql } = service
  const rpc = (name, body = {}, actor = run.users[0]) =>
    request(`/rest/v1/rpc/${name}`, {
      key: run.anonKey,
      token: actor.token,
      schema: 'app_public',
      body,
    })
  const read = (id) => rpc('get_trip', { trip_id: id })
  async function fixture(command, stops = 0) {
    // Seed each command independently. Creation itself is exercised separately.
    const tripId = crypto.randomUUID(),
      stopIds = [crypto.randomUUID(), crypto.randomUUID()]
    await sql(
      `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${tripId}','${run.users[0].id}','00000000-0000-4000-8000-000000000001','Probe ${command}','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${tripId}','${run.users[0].id}','creator'); ${stopIds
        .slice(0, stops)
        .map(
          (id, index) =>
            `insert into trip_private.trip_stops(stop_id,trip_id,kind,store_id,position,priority,planned_dwell_minutes) values ('${id}','${tripId}','store','${index ? STORE_B : STORE_A}',${index},'prefer',60);`,
        )
        .join(' ')}`,
    )
    // An independent SQL read supplies version even if get_trip is broken.
    const version = Number(
      (await sql(`select version from trip_private.trips where trip_id='${tripId}';`)).trim(),
    )
    return { tripId, stopIds, version }
  }
  async function saved(saved) {
    await sql(
      `delete from shopper_private.saved_stores where user_id='${run.users[0].id}' and store_id='${STORE_A}'; ${saved ? `insert into shopper_private.saved_stores(user_id,store_id) values ('${run.users[0].id}','${STORE_A}');` : ''}`,
    )
  }
  async function denied(name, body) {
    let rejected = false
    try {
      const value = await rpc(name, body, run.users[1])
      rejected = value === null
    } catch (error) {
      if (/HTTP (401|403)|authorization_lost|not_allowed/.test(error.message)) rejected = true
      else throw error
    }
    assert.equal(rejected, true, `Sibling ${name} must be denied`)
  }
  return async (command) => {
    if (command === 'catalog_list' || command === 'catalog_details') {
      const result = await request('/functions/v1/public-catalog', {
        key: run.anonKey,
        token: run.users[0].token,
        origin: run.origin,
        body:
          command === 'catalog_list'
            ? { operation: 'list', args: { p_q: null, p_category: null, p_area: null } }
            : { operation: 'details', args: { p_slug: 'clockwork-cabinet' } },
      })
      assert.ok(Array.isArray(result.data), 'Catalog Edge response must contain data array')
      assert.equal(
        result.data.find((store) => store.id === STORE_A)?.name,
        'Clockwork Cabinet',
        'Catalog must return the independent fictional store',
      )
      if (command === 'catalog_details') assert.equal(result.data.length, 1)
    } else if (command === 'shopper_save_state') {
      await saved(false)
      assert.deepEqual(await rpc('shopper_save_state', { p_store_id: STORE_A }), { saved: false })
      assert.deepEqual(await rpc('shopper_set_save', { p_store_id: STORE_A, p_saved: true }), {
        saved: true,
      })
      assert.deepEqual(await rpc('shopper_save_state', { p_store_id: STORE_A }), { saved: true })
      assert.equal(
        (
          await sql(
            `select count(*) from shopper_private.saved_stores where user_id='${run.users[0].id}' and store_id='${STORE_A}';`,
          )
        ).trim(),
        '1',
      )
      assert.deepEqual(await rpc('shopper_save_state', { p_store_id: STORE_A }, run.users[1]), {
        saved: false,
      })
      await rpc('shopper_set_save', { p_store_id: STORE_A, p_saved: false }, run.users[1])
      assert.deepEqual(await rpc('shopper_save_state', { p_store_id: STORE_A }), { saved: true })
      await rpc('shopper_set_save', { p_store_id: STORE_A, p_saved: false })
      assert.deepEqual(await rpc('shopper_save_state', { p_store_id: STORE_A }), { saved: false })
    } else if (command === 'shopper_list_saved') {
      await saved(true)
      const list = await rpc('shopper_list_saved')
      assert.ok(Array.isArray(list))
      assert.equal(list.find((s) => s.storeId === STORE_A)?.name, 'Clockwork Cabinet')
      assert.deepEqual(await rpc('shopper_list_saved', {}, run.users[1]), [])
    } else if (command === 'create_trip') {
      const trip = await rpc('create_trip', {
        name: 'Probe created trip',
        local_date: '2026-10-10',
      })
      assert.match(trip.id, /^[a-f0-9-]{36}$/)
      assert.equal(trip.name, 'Probe created trip')
      assert.equal((await read(trip.id)).localDate, '2026-10-10')
      assert.equal(
        (await sql(`select owner_id from trip_private.trips where trip_id='${trip.id}';`)).trim(),
        run.users[0].id,
      )
    } else {
      const stopCount = ['remove_stop', 'set_priority', 'set_dwell', 'reorder_stops'].includes(
        command,
      )
        ? 2
        : 0
      const { tripId, stopIds, version } = await fixture(command, stopCount)
      const body = { trip_id: tripId }
      if (command === 'get_trip') {
        assert.equal((await read(tripId)).name, 'Probe get_trip')
        await denied('get_trip', body)
        const before = await read(tripId)
        await denied('rename_trip', {
          ...body,
          new_name: 'Sibling attempt',
          expected_version: version,
          idempotency_key: crypto.randomUUID(),
        })
        assert.deepEqual(
          await read(tripId),
          before,
          'Denied sibling write must not change the owner trip',
        )
      } else if (command === 'rename_trip') {
        const args = {
          ...body,
          new_name: 'Renamed by probe',
          expected_version: version,
          idempotency_key: crypto.randomUUID(),
        }
        await rpc('rename_trip', args)
        assert.equal((await read(tripId)).name, 'Renamed by probe')
      } else if (command === 'update_schedule') {
        await rpc('update_trip_schedule', {
          ...body,
          local_date: '2026-10-11',
          departure_minute: 600,
          expected_version: version,
        })
        const actual = await read(tripId)
        assert.equal(actual.localDate, '2026-10-11')
        assert.equal(actual.departureMinute, 600)
      } else if (command === 'add_stop') {
        await rpc('add_trip_store_stop', { ...body, store_id: STORE_A })
        await rpc('add_trip_store_stop', { ...body, store_id: STORE_B })
        assert.deepEqual(
          (await read(tripId)).stops.map((s) => s.storeId),
          [STORE_A, STORE_B],
        )
      } else if (command === 'remove_stop') {
        await rpc('remove_trip_stop', { ...body, stop_id: stopIds[0], expected_version: version })
        assert.deepEqual(
          (await read(tripId)).stops.map((s) => s.id),
          [stopIds[1]],
        )
      } else if (command === 'set_priority') {
        await rpc('set_trip_stop_priority', {
          ...body,
          stop_id: stopIds[0],
          priority: 'must',
          expected_version: version,
        })
        assert.equal((await read(tripId)).stops.find((s) => s.id === stopIds[0]).priority, 'must')
      } else if (command === 'set_dwell') {
        await rpc('set_trip_stop_dwell', {
          ...body,
          stop_id: stopIds[0],
          dwell_minutes: 90,
          expected_version: version,
        })
        assert.equal(
          (await read(tripId)).stops.find((s) => s.id === stopIds[0]).plannedDwellMinutes,
          90,
        )
      } else if (command === 'reorder_stops') {
        await rpc('reorder_trip_stop', { ...body, stop_id: stopIds[1], position: 0 })
        assert.deepEqual(
          (await read(tripId)).stops.map((s) => s.id),
          [stopIds[1], stopIds[0]],
        )
      } else throw new Error('Unknown probe command')
    }
    return {
      status: 'pass',
      evidenceClass: 'configured-local-transport',
      role: command.startsWith('catalog')
        ? 'authenticated-shopper-via-public-catalog-edge'
        : 'authenticated-shopper',
      detail: 'Actual HTTP command and independent fixture/readback assertions passed',
    }
  }
}
