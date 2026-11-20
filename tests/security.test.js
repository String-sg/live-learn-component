import assert from 'node:assert/strict'
import { test } from 'node:test'
import { base, client, hostClient, joinBody, paintBody, passphrase, roomPath } from './client.js'

const localOnly = { skip: process.env.LL_TEST_FIXTURE !== '1' }

async function resetLimits() {
  const response = await fetch(base + '/__test/reset-limits', {
    headers: { 'X-Fixture-Key': process.env.HOST_SIGNING_KEY },
  })
  assert.equal(response.status, 204)
}

test('limits repeated host sign-in attempts by source', localOnly, async () => {
  const source = { 'CF-Connecting-IP': '192.0.2.41' }
  await Promise.all(Array.from({ length: 20 }, () =>
    client().request('/host/login', { passphrase: 'incorrect' }, 401, source)))
  const blocked = await fetch(base + '/api/host/login', {
    method: 'POST', headers: { ...source, 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  })
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers.get('Retry-After')) > 0)
  await client().request('/host/login', { passphrase }, 200, { 'CF-Connecting-IP': '192.0.2.42' })
  await resetLimits()
  await client().request('/host/login', { passphrase }, 200, source)
})

test('one member cannot exhaust the shared paint allowance in a burst', localOnly, async () => {
  const host = await hostClient()
  const { pin } = await host.request('/rooms', { requestId: crypto.randomUUID() })
  const path = roomPath(pin)
  const first = client()
  const second = client()
  try {
    await first.request(path + '/join', joinBody('Burst'))
    await second.request(path + '/join', joinBody('Other'))
    await host.request(path + '/start', {})
    const firstPaint = paintBody(0, 1)
    const receipt = await first.request(path + '/pixels', firstPaint)
    await Promise.all(Array.from({ length: 59 }, (_, index) =>
      first.request(path + '/pixels', paintBody(index + 1, 1))))
    const throttled = await fetch(base + '/api' + path + '/pixels', {
      method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(paintBody(100, 1)),
    })
    assert.equal(throttled.status, 429)
    assert.ok(Number(throttled.headers.get('Retry-After')) > 0)
    assert.deepEqual(await first.request(path + '/pixels', firstPaint), receipt)
    await second.request(path + '/pixels', paintBody(100, 2))
    await resetLimits()
    await first.request(path + '/pixels', paintBody(101, 3))
    await host.request(path + '/end', {})
    await first.request(path + '/pixels', paintBody(102, 4), 409)
  } finally {
    await host.request(path + '/end', {})
  }
})

test('rejects unsafe origins and malformed input without exposing credentials', localOnly, async () => {
  const host = await hostClient()
  const { pin } = await host.request('/rooms', { requestId: crypto.randomUUID() })
  const path = roomPath(pin)
  const guest = client()
  try {
    await guest.request(path + '/join', joinBody('<img src=x>'))
    const snapshot = await guest.request(path)
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'expiresAt', 'guests', 'nickname', 'pin', 'pixels', 'revision', 'status',
    ])
    const otherOrigin = { Origin: 'https://example.com' }
    await host.request(path + '/start', {}, 403, otherOrigin)
    await host.request('/host/login', { passphrase }, 403, otherOrigin)
    await guest.request(path + '/join', joinBody(), 403, otherOrigin)
    await guest.request(path + '/pixels', paintBody(0, 1), 403, otherOrigin)
    const oversized = await fetch(base + '/api' + path + '/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(joinBody('a'.repeat(1500))),
    })
    assert.equal(oversized.status, 400)
    const malformed = await fetch(base + '/api' + path + '/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    })
    assert.equal(malformed.status, 400)
  } finally {
    await host.request(path + '/end', {})
  }
})

test('bounds failed PIN guesses while allowing an existing member to resume', localOnly, async () => {
  const host = await hostClient()
  const { pin } = await host.request('/rooms', { requestId: crypto.randomUUID() })
  const path = roomPath(pin)
  const member = client()
  const source = { 'CF-Connecting-IP': '192.0.2.43' }
  try {
    await member.request(path + '/join', joinBody('Resume'), 200, source)
    // End gives a deterministic failed join without guessing any unrelated PIN.
    await host.request(path + '/end', {})
    await Promise.all(Array.from({ length: 30 }, () =>
      client().request(path + '/join', joinBody(), 409, source)))
    await client().request(path + '/join', joinBody(), 429, source)
    const resumed = await member.request(path + '/join', joinBody('New name'), 200, source)
    assert.equal(resumed.nickname, 'Resume')
    assert.equal(resumed.status, 'ended')
    assert.equal(resumed.guests, 1)
    const ended = await host.request(path + '/end', {})
    assert.equal(ended.revision, resumed.revision)
    await host.request(path + '/start', {}, 409)
  } finally {
    await host.request(path + '/end', {})
  }
})
