const encoder = new TextEncoder()
const hours = 8
const lifetime = hours * 60 * 60

function key(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.HOST_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function hostCookie(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-ll_host' : 'll_host'
}

export function readCookie(request, name) {
  return request.headers.get('Cookie')?.split(/;\s*/).find(value => value.startsWith(name + '='))
    ?.slice(name.length + 1) ?? ''
}

export function cookie(request, name, value, path, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`
}

export async function signHost(subject, env) {
  const payload = btoa(JSON.stringify({ subject, expires: Math.floor(Date.now() / 1000) + lifetime }))
  const signature = await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload))
  return payload + '.' + btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export async function readHost(request, env) {
  const token = readCookie(request, hostCookie(request))
  if (!env.HOST_SIGNING_KEY || token.length > 512 || !/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(token)) return null
  const [payload, signature] = token.split('.')
  try {
    const valid = await crypto.subtle.verify('HMAC', await key(env),
      Uint8Array.from(atob(signature), c => c.charCodeAt(0)), encoder.encode(payload))
    if (!valid) return null
    const { subject, expires } = JSON.parse(atob(payload))
    return expires > Math.floor(Date.now() / 1000) && typeof subject === 'string' ? subject : null
  } catch {
    return null
  }
}

export async function loginHost(request, env, passphrase) {
  if (!env.HOST_PASSPHRASE || !env.HOST_SIGNING_KEY || typeof passphrase !== 'string') return null
  const [expected, supplied] = await Promise.all([env.HOST_PASSPHRASE, passphrase]
    .map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const a = new Uint8Array(expected)
  const b = new Uint8Array(supplied)
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  if (difference !== 0) return null
  return cookie(request, hostCookie(request), await signHost('demo-host', env), '/', lifetime)
}

export function logoutHost(request) {
  return cookie(request, hostCookie(request), '', '/', 0)
}
