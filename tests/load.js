import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { base, client, hostClient, joinBody, paintBody, roomPath } from './client.js'

const target = new URL(base)
assert.ok((target.protocol === 'https:' && /^live-learn-component-preview\.[\w-]+\.workers\.dev$/.test(target.hostname)) ||
  (target.protocol === 'http:' && target.hostname === '127.0.0.1'), 'Use the isolated preview Worker or localhost.')
const students = 100
const seconds = Number(process.env.DURATION_SECONDS ?? 300)
assert.ok(Number.isInteger(seconds) && seconds >= 5 && seconds <= 300)

const samples = { join: [], paint: [], poll: [] }
const statuses = {}
const startDelays = []
const endDelays = []
const errors = []
let startAt, endAt, activeFor, pin, loops = [], stopped = false
let replayed = 0
let reconnected = 0
let finalRoom

function record({ path, status, ms }) {
  statuses[status] = (statuses[status] ?? 0) + 1
  if (path.endsWith('/join')) samples.join.push(ms)
  if (path.endsWith('/pixels')) samples.paint.push(ms)
  if (path.includes('?since=')) samples.poll.push(ms)
}

function p95(values) {
  if (!values.length) return null
  return Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1])
}

const host = await hostClient(record)
try {
  const room = await host.request('/rooms', { requestId: crypto.randomUUID() })
  pin = room.pin
  const path = roomPath(pin)
  const guests = Array.from({ length: students }, () => ({ client: client('', record), revision: -1 }))
  await Promise.all(guests.map(async (guest, index) => {
    const joined = await guest.client.request(path + '/join', joinBody('Synthetic ' + (index + 1)))
    assert.equal(joined.status, 'waiting')
    guest.revision = joined.revision
  }))
  const joined = await host.request(path + '?role=host')
  assert.equal(joined.guests, students)

  loops = guests.map(async (guest, index) => {
    await sleep(index * 15)
    while (!stopped) {
      assert.ok(!endAt || performance.now() - endAt < 10000, 'End did not propagate to a student.')
      const state = await guest.client.request(path + '?since=' + guest.revision, undefined, [200, 204])
      if (state) {
        guest.revision = state.revision
        if (state.status === 'live' && !guest.started) {
          guest.started = true
          startDelays.push(performance.now() - startAt)
        }
        if (state.status === 'ended') {
          endDelays.push(performance.now() - endAt)
          assert.equal(state.guests, students)
          assert.equal(state.pixels.slice(0, students), '4'.repeat(students))
          return
        }
      }
      await sleep(1350 + Math.random() * 250)
    }
  }).map(promise => promise.catch(error => { errors.push(error.message) }))

  startAt = performance.now()
  await host.request(path + '/start', {})
  const liveAt = performance.now()
  const paintWaves = [0.02, 0.22, 0.48, 0.8]
  const first = []
  for (const [wave, fraction] of paintWaves.entries()) {
    await sleep(Math.max(0, liveAt + seconds * 1000 * fraction - performance.now()))
    await Promise.all(guests.map(async (guest, index) => {
      const body = paintBody(index, wave + 1)
      const receipt = await guest.client.request(path + '/pixels', body)
      if (wave === 0) first[index] = { body, receipt }
    }))
    if (wave === 1) {
      await Promise.all(guests.slice(0, 10).map(async (guest, index) => {
        guest.client = client(guest.client.cookie, record)
        const resumed = await guest.client.request(path)
        assert.equal(resumed.nickname, 'Synthetic ' + (index + 1))
        assert.equal(resumed.guests, students)
        reconnected++
        const { body, receipt } = first[index]
        assert.deepEqual(await guest.client.request(path + '/pixels', body), receipt)
        replayed++
      }))
    }
  }
  await sleep(Math.max(0, liveAt + seconds * 1000 - performance.now()))
  endAt = performance.now()
  activeFor = Math.round(endAt - liveAt)
  finalRoom = await host.request(path + '/end', {})
  await Promise.all(loops)
} catch (error) {
  errors.push(error.message)
} finally {
  stopped = true
  await Promise.allSettled(loops)
  if (pin && !finalRoom) {
    try { await host.request(roomPath(pin, '/end'), {}) } catch (error) { errors.push(error.message) }
  }
}

const result = {
  target: target.origin,
  students: finalRoom?.guests ?? 0,
  activeMs: activeFor ?? null,
  uniquePaints: samples.paint.length - replayed,
  replayed,
  reconnected,
  requests: Object.values(statuses).reduce((total, count) => total + count, 0),
  statuses,
  p95Ms: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, p95(values)])),
  start: { observed: startDelays.length, maxMs: startDelays.length ? Math.round(Math.max(...startDelays)) : null },
  end: { observed: endDelays.length, maxMs: endDelays.length ? Math.round(Math.max(...endDelays)) : null },
  finalRevision: finalRoom?.revision ?? null,
  unexpectedErrors: errors,
}
console.log(JSON.stringify(result, null, 2))
assert.deepEqual(errors, [])
assert.equal(result.students, students)
assert.ok(result.activeMs >= seconds * 1000 - 5)
assert.equal(result.uniquePaints, 400)
assert.equal(replayed, 10)
assert.equal(reconnected, 10)
assert.equal(finalRoom.revision, 502)
for (const measurement of [result.start, result.end]) {
  assert.equal(measurement.observed, students)
  assert.ok(measurement.maxMs <= 3000)
}
assert.ok(result.p95Ms.join <= 1500)
assert.ok(result.p95Ms.paint <= 1500)
