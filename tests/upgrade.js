import assert from 'node:assert/strict'

export async function prepareUpgrade(base, passphrase) {
  async function request(path, body, cookie = '') {
    const response = await fetch(base + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    })
    assert.equal(response.status, 200, path)
    return { data: await response.json(), cookie: response.headers.get('Set-Cookie')?.split(';')[0] }
  }
  const host = (await request('/host/login', { passphrase })).cookie
  const requestId = crypto.randomUUID()
  const { data: room } = await request('/rooms', { requestId }, host)
  const path = '/rooms/' + room.pin
  const joined = await request(path + '/join', { nickname: 'Before upgrade', joinKey: crypto.randomUUID() })
  await request(path + '/start', {}, host)
  const paint = { op: crypto.randomUUID(), cell: 4, colour: 3 }
  const { data: receipt } = await request(path + '/pixels', paint, joined.cookie)
  return { request, requestId, path, pin: room.pin, host, guest: joined.cookie, paint, receipt }
}

export async function verifyUpgrade(state) {
  const { request, requestId, path, pin, host, guest, paint, receipt } = state
  try {
    const { data: resumed } = await request(path, undefined, guest)
    assert.equal(resumed.nickname, 'Before upgrade')
    assert.equal(resumed.guests, 1)
    assert.equal(resumed.status, 'live')
    assert.equal(resumed.pixels[4], '3')
    assert.equal((await request('/rooms', { requestId }, host)).data.pin, pin)
    assert.deepEqual((await request(path + '/pixels', paint, guest)).data, receipt)
    await request(path + '/pixels', { op: crypto.randomUUID(), cell: 5, colour: 2 }, guest)
  } finally {
    await request(path + '/end', {}, host)
  }
  console.log('Persisted baseline room, host cookie, membership and paint receipt survived the upgrade.')
}
