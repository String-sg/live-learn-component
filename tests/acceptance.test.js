import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signHost } from '../src/host-auth.js'
import { base, client, hostClient, joinBody, paintBody, roomPath } from './client.js'

test('independent clients enforce lifecycle, isolation, and retry receipts', async () => {
  const anon = client()
  await anon.request('/host/login', { passphrase: 'incorrect' }, 401)
  await anon.request('/rooms', { requestId: crypto.randomUUID() }, 401)

  const host = await hostClient()
  const ids = { requestId: crypto.randomUUID() }
  const [room, retry] = await Promise.all([host.request('/rooms', ids), host.request('/rooms', ids)])
  assert.equal(room.pin, retry.pin)
  assert.match(room.pin, /^\d{8}$/)
  assert.ok(Math.abs(room.expiresAt - Date.now() - 7200000) < 10000)
  assert.equal(room.status, 'waiting')
  const secondRoom = await host.request('/rooms', { requestId: crypto.randomUUID() })
  assert.notEqual(room.pin, secondRoom.pin)
  const path = roomPath(room.pin)
  const secondPath = roomPath(secondRoom.pin)
  const hostRead = path + '?role=host'

  try {
    await anon.request(path, undefined, 401)
    await anon.request(path + '/start', {}, 401)
    await anon.request(path + '/end', {}, 401)
    const signingKey = process.env.HOST_SIGNING_KEY
    if (signingKey) {
      assert.equal(new URL(base).hostname, '127.0.0.1', 'Never use a deployed signing key in acceptance tests.')
      const token = await signHost('other-host', { HOST_SIGNING_KEY: signingKey })
      const otherHost = client('ll_host=' + token)
      assert.equal((await otherHost.request('/host')).signedIn, true)
      await otherHost.request(hostRead, undefined, 403)
      await otherHost.request(path + '/start', {}, 403)
      await otherHost.request(path + '/end', {}, 403)
    }
    const fakeHost = client((new URL(base).protocol === 'https:' ? '__Host-' : '') + 'll_host=forged')
    await fakeHost.request(path + '/end', {}, 401)
    await host.request(path + '/start', {}, 403, { Origin: 'https://example.com' })
    await anon.request(path + '/join', joinBody(''), 400)
    await anon.request(roomPath('123', '/join'), joinBody(), 404)

    const [a, duplicate, b, other] = [client(), client(), client(), client()]
    const firstJoin = joinBody('Same name')
    await Promise.all([
      a.request(path + '/join', firstJoin),
      duplicate.request(path + '/join', firstJoin),
      b.request(path + '/join', joinBody('Same name')),
      other.request(secondPath + '/join', joinBody('Other room')),
    ])
    assert.equal(a.cookie, duplicate.cookie)
    assert.notEqual(a.cookie, b.cookie)
    assert.equal((await host.request(hostRead)).guests, 2)
    assert.equal((await a.request(path)).nickname, 'Same name')
    await a.request(path + '/join', joinBody('New name'))
    assert.equal((await a.request(path)).nickname, 'Same name')
    await a.request(path + '/start', {}, 401)
    await a.request(path + '/end', {}, 401)
    await a.request('/rooms', { requestId: crypto.randomUUID() }, 401)
    await a.request(path + '/pixels', paintBody(1, 1), 409)
    await a.request(secondPath, undefined, 403)
    await a.request(secondPath + '/pixels', paintBody(1, 1), 403)
    await anon.request(path + '/pixels', paintBody(1, 1), 401)
    await host.request(path + '/pixels', paintBody(1, 1), 401)

    const started = await Promise.all([host.request(path + '/start', {}), host.request(path + '/start', {})])
    assert.equal(started[0].revision, started[1].revision)
    assert.equal(started[0].status, 'live')
    await a.request(path + '/pixels', paintBody(256, 1), 400)
    await a.request(path + '/pixels', paintBody(1, 7), 400)
    const firstPaint = paintBody(1, 1)
    const [receipt] = await Promise.all([
      a.request(path + '/pixels', firstPaint), b.request(path + '/pixels', paintBody(2, 2)),
    ])
    const seen = await Promise.all([a.request(path), b.request(path), host.request(hostRead)])
    assert.ok(seen.every(state => state.pixels.slice(0, 3) === '012'))
    assert.equal((await other.request(secondPath)).pixels, '0'.repeat(256))
    await host.request(secondPath + '/start', {})
    await other.request(secondPath + '/pixels', paintBody(1, 6))

    const competing = await Promise.all([
      a.request(path + '/pixels', paintBody(1, 3)), b.request(path + '/pixels', paintBody(1, 4)),
    ])
    const winningColour = competing[0].revision > competing[1].revision ? '3' : '4'
    const after = await client(a.cookie).request(path)
    assert.equal(after.pixels[1], winningColour)
    assert.equal(after.guests, 2)
    assert.equal(after.nickname, 'Same name')
    assert.deepEqual(await a.request(path + '/pixels', firstPaint), receipt)
    await a.request(path + '/pixels', { ...firstPaint, colour: 2 }, 409)
    assert.equal((await a.request(path)).pixels[1], winningColour)
    assert.equal((await other.request(secondPath)).pixels[1], '6')
    assert.equal(await a.request(path + '?since=' + after.revision, undefined, 204), null)

    const [end, racingPaint] = await Promise.all([
      host.request(path + '/end', {}), a.request(path + '/pixels', paintBody(4, 5), [200, 409]),
    ])
    const final = await b.request(path)
    assert.equal(final.status, 'ended')
    assert.equal(final.revision, end.revision)
    assert.equal(final.pixels[4], racingPaint.revision ? '5' : '0')
    if (racingPaint.revision) assert.ok(racingPaint.revision < final.revision)
    assert.equal((await host.request(path + '/end', {})).revision, end.revision)
    await host.request(path + '/start', {}, 409)
    await a.request(path + '/pixels', paintBody(5, 3), 409)
    await client().request(path + '/join', joinBody(), 409)
    assert.deepEqual(await a.request(path + '/pixels', firstPaint), receipt)
    assert.equal((await a.request(path)).pixels, final.pixels)
    assert.equal((await other.request(secondPath)).status, 'live')
  } finally {
    await Promise.all([host.request(path + '/end', {}), host.request(secondPath + '/end', {})])
  }
})

test('bounds guest capacity and removes expired membership', { skip: process.env.LL_TEST_FIXTURE !== '1' }, async () => {
  assert.equal(new URL(base).hostname, '127.0.0.1')
  const host = await hostClient()
  const { pin } = await host.request('/rooms', { requestId: crypto.randomUUID() })
  const path = roomPath(pin)
  const guests = Array.from({ length: 120 }, () => client())
  try {
    await Promise.all(guests.map(guest => guest.request(path + '/join', joinBody('Synthetic'))))
    assert.equal((await host.request(path + '?role=host')).guests, 120)
    await client().request(path + '/join', joinBody(), 409)
    const headers = { 'X-Fixture-Key': process.env.HOST_SIGNING_KEY }
    const expired = await fetch(base + '/__test/expire/' + pin, { headers })
    assert.equal(expired.status, 204)
    await guests[0].request(path, undefined, 404)
    await host.request(path + '/start', {}, 404)
    await client().request(path + '/join', joinBody(), 404)
    const swept = await fetch(base + '/__test/sweep/' + pin, { headers }).then(response => response.json())
    assert.equal(swept.found, false)
    assert.equal(swept.guestRows, 0)
  } finally {
    await host.request(path + '/end', {}, [200, 404])
  }
})
