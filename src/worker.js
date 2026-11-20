import { loginHost, logoutHost, readHost } from './host-auth.js'
import { cookie, digest, fail, readCookie, readJson, reply, requestSource } from './http.js'
export { Rooms } from './rooms.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const guestCookie = 'll_guest'
async function getGuest(request) {
  const value = readCookie(request, guestCookie)
  return uuid.test(value) ? digest(value) : ''
}

// The room store depends only on an authenticated subject, not the sign-in mechanism.
export function createWorker(auth) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url)
      const { pathname: path } = url
      const method = request.method
      if (!path.startsWith('/api/')) {
        const asset = await env.ASSETS.fetch(request)
        const secured = new Response(asset.body, asset)
        secured.headers.set('Referrer-Policy', 'no-referrer')
        secured.headers.set('X-Content-Type-Options', 'nosniff')
        secured.headers.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        return secured
      }

      const origin = request.headers.get('Origin')
      if (method === 'POST' && origin && origin !== url.origin) return fail(403, 'Cross-origin request denied.')

      if (path === '/api/host' && method === 'GET') {
        return reply({ signedIn: Boolean(await auth.read(request, env)) })
      }
      if (path === '/api/host/login' && method === 'POST') {
        const source = await requestSource(request, env.HOST_SIGNING_KEY)
        const retryAfter = await env.ROOMS.getByName('classroom-v1').loginLimit(source)
        if (retryAfter) return reply({ status: 429, error: 'Too many sign-in attempts. Try again in a minute.', retryAfter })
        const session = await auth.login(request, env, (await readJson(request))?.passphrase)
        return session ? reply({ signedIn: true }, { 'Set-Cookie': session }) : fail(401, 'That host passphrase did not match.')
      }
      if (path === '/api/host/logout' && method === 'POST') {
        return reply({ signedIn: false }, { 'Set-Cookie': auth.logout(request) })
      }

      const store = env.ROOMS.getByName('classroom-v1')
      const match = /^\/api\/rooms\/(\d{8})(?:\/(join|start|end|pixels))?$/.exec(path)
      if (path === '/api/rooms' && method === 'POST') {
        const host = await auth.read(request, env)
        if (!host) return fail(401, 'Sign in as the host.')
        const id = (await readJson(request))?.requestId
        if (typeof id !== 'string' || !uuid.test(id)) return fail(400, 'A valid request ID is required.')
        return reply(await store.create(host, id))
      }
      if (!match) return fail(404, 'Route not found.')

      const [, pin, action] = match
      if (!action && method === 'GET') {
        const since = url.searchParams.get('since')
        const host = url.searchParams.get('role') === 'host' ? await auth.read(request, env) : null
        const guest = url.searchParams.get('role') === 'host' ? '' : await getGuest(request)
        return reply(await store.read(pin, host, guest, /^\d+$/.test(since ?? '') ? Number(since) : -1))
      }
      if (method !== 'POST') return fail(405, 'Method not allowed.')
      if (action === 'start' || action === 'end') {
        const host = await auth.read(request, env)
        return host ? reply(await store.transition(pin, host, action)) : fail(401, 'Sign in as the host.')
      }
      if (action === 'join') {
        const body = await readJson(request)
        const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : ''
        const joinKey = body?.joinKey
        if (!nickname || [...nickname].length > 24 || /[\p{C}]/u.test(nickname) || typeof joinKey !== 'string' || !uuid.test(joinKey)) {
          return fail(400, 'Enter a nickname of 1–24 characters.')
        }
        const [secret, source, resumeSecret] = await Promise.all([
          digest(joinKey), requestSource(request, env.HOST_SIGNING_KEY), getGuest(request),
        ])
        const result = await store.join(pin, secret, nickname, source, resumeSecret)
        if (result.error) return reply(result)
        if (result.resumed) return reply(result.room)
        const maxAge = Math.max(0, Math.ceil((result.room.expiresAt - Date.now()) / 1000))
        return reply(result.room, { 'Set-Cookie': cookie(request, guestCookie, joinKey, `/api/rooms/${pin}`, maxAge) })
      }
      if (action === 'pixels') {
        const guest = await getGuest(request)
        if (!guest) return fail(401, 'Join this room to paint.')
        const { op, cell, colour } = await readJson(request) ?? {}
        if (typeof op !== 'string' || !uuid.test(op) || !Number.isInteger(cell) || cell < 0 || cell >= 256 ||
          !Number.isInteger(colour) || colour < 0 || colour > 6) {
          return fail(400, 'Select a valid cell and colour.')
        }
        return reply(await store.paint(pin, guest, op, cell, colour))
      }
      return fail(405, 'Method not allowed.')
    },
  }
}

export default createWorker({ read: readHost, login: loginHost, logout: logoutHost })
