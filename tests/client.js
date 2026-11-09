import assert from 'node:assert/strict'

export const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787'
export const passphrase = process.env.HOST_PASSPHRASE

export function client(initialCookie = '', record = () => {}) {
  let cookie = initialCookie
  return {
    get cookie() { return cookie },
    async request(path, body, expected = 200, extraHeaders = {}) {
      const started = performance.now()
      const response = await fetch(base + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
      const setCookie = response.headers.get('Set-Cookie')
      if (setCookie) cookie = setCookie.split(';', 1)[0]
      const data = response.status === 204 ? null : await response.json()
      record({ path, status: response.status, ms: performance.now() - started })
      assert.ok([expected].flat().includes(response.status),
        `${path} returned ${response.status} (expected ${expected})${data?.error ? ': ' + data.error : ''}`)
      return data
    },
  }
}

export async function hostClient(record) {
  assert.ok(passphrase, 'Set HOST_PASSPHRASE for the test deployment.')
  const host = client('', record)
  await host.request('/host/login', { passphrase })
  return host
}

export const roomPath = (pin, suffix = '') => '/rooms/' + pin + suffix
export const joinBody = (nickname = 'Test student', joinKey = crypto.randomUUID()) => ({ nickname, joinKey })
export const paintBody = (cell, colour, op = crypto.randomUUID()) => ({ cell, colour, op })
