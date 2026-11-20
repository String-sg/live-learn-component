export async function api(path, body) {
  const options = { signal: AbortSignal.timeout(6500) }
  if (body) Object.assign(options, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const response = await fetch('/api' + path, options)
  if (response.status === 204) return null
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status })
  return data
}

export const roomPath = (pin, action = '') => '/rooms/' + pin + action
