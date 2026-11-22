const encoder = new TextEncoder()
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

export function reply(result, extraHeaders) {
  const status = typeof result.status === 'number' ? result.status : 200
  const options = { status, headers: { ...headers, ...extraHeaders } }
  if (result.retryAfter) options.headers['Retry-After'] = String(result.retryAfter)
  if (status === 204) return new Response(null, options)
  return Response.json(result.error ? { error: result.error } : result, options)
}

export const fail = (status, error) => reply({ status, error })

export async function readJson(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let size = 0
  let raw = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > 1024) {
      await reader.cancel()
      return null
    }
    raw += decoder.decode(value, { stream: true })
  }
  try {
    const data = JSON.parse(raw + decoder.decode())
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    n => n.toString(16).padStart(2, '0')).join('')
}

export function readCookie(request, name) {
  return request.headers.get('Cookie')?.split(/;\s*/).find(value => value.startsWith(name + '='))
    ?.slice(name.length + 1) ?? ''
}

export function cookie(request, name, value, path, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`
}

export function requestSource(request, salt = '') {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  return digest(salt + ':' + ip)
}
