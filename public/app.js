import { api, roomPath } from './api.js'
import { createCanvas } from './canvas.js'

const $ = id => document.getElementById(id)
const stages = { waiting: 'Waiting room', live: 'Live activity', ended: 'Room ended' }
const pinPattern = /^\d{8}$/

let room
let role = 'guest'
let signedIn = false
let timer
let version = 0
let disconnected = false
let pending

const renderCanvas = createCanvas($('board'), $('palette'), paint => {
  if (pending) return
  pending = { data: { ...paint, op: crypto.randomUUID() } }
  sendPaint(version)
})

const say = message => { $('notice').textContent = message }

function syncUrl(param, pin) {
  const url = new URL(location.href)
  url.search = pin ? '?' + param + '=' + pin : ''
  history.replaceState(null, '', url)
}

function renderEntry() {
  $('entry').hidden = false
  $('session').hidden = true
  $('sample').hidden = false
  $('board').hidden = true
  $('stage-status').textContent = 'Sample canvas'
  $('stage-detail').textContent = '16 × 16'
  $('board').closest('.stage').dataset.status = ''
  $('paint-tools').hidden = true
  $('student-mode').setAttribute('aria-pressed', String(role === 'guest'))
  $('host-mode').setAttribute('aria-pressed', String(role === 'host'))
  $('join').hidden = role !== 'guest'
  $('login').hidden = role !== 'host' || signedIn
  $('launcher').hidden = role !== 'host' || !signedIn
  $('resume').hidden = !pinPattern.test(localStorage.getItem('lastHostPin') ?? '')
}

function renderRoom() {
  $('entry').hidden = true
  $('session').hidden = false
  $('sample').hidden = true
  $('board').hidden = false
  $('identity').textContent = role === 'host' ? 'Host view' : room.nickname
  $('room-pin').textContent = room.pin.slice(0, 4) + ' ' + room.pin.slice(4)
  $('stage-status').textContent = disconnected ? 'Reconnecting…' : stages[room.status]
  $('board').closest('.stage').dataset.status = disconnected ? 'offline' : room.status
  const painted = [...room.pixels].filter(colour => colour !== '0').length
  $('stage-detail').textContent = `${painted} / 256 painted`
  const guests = `${room.guests} ${room.guests === 1 ? 'student' : 'students'} joined.`
  const messages = {
    waiting: role === 'host' ? 'Share the PIN and start when everyone is ready.' : 'Wait for your host to start.',
    live: role === 'host' ? 'Watch the picture take shape.' : 'Pick a colour, then tap a square.',
    ended: 'Your host has closed this room.',
  }
  const message = guests + ' ' + messages[room.status]
  if ($('room-message').textContent !== message) $('room-message').textContent = message
  $('host-actions').hidden = role !== 'host'
  $('copy').hidden = room.status === 'ended'
  $('start').hidden = room.status !== 'waiting'
  $('end').hidden = room.status === 'ended'
  const canPaint = room.status === 'live' && role === 'guest'
  $('paint-tools').hidden = !canPaint
  if (canPaint) $('board').setAttribute('aria-describedby', 'board-help')
  else $('board').removeAttribute('aria-describedby')
  renderCanvas(room.pixels, canPaint)
}

function enter(data) {
  clearTimeout(timer)
  pending = undefined
  disconnected = false
  room = data
  if (role === 'host') localStorage.setItem('lastHostPin', data.pin)
  syncUrl(role === 'host' ? 'host' : 'pin', data.pin)
  say('')
  renderRoom()
  $('room-title').focus()
  schedulePoll(++version)
}

function update(data) {
  if (data && data.revision >= room.revision) room = data
  renderRoom()
}

function goToEntry(nextRole, pin) {
  version++
  clearTimeout(timer)
  pending = undefined
  room = undefined
  role = nextRole
  syncUrl(role === 'host' ? 'host' : 'pin', pin)
  $('pin').value = pin ?? ''
  say('')
  renderEntry()
}

function schedulePoll(current) {
  if (current !== version || (room.status === 'ended' && !pending)) return
  clearTimeout(timer)
  timer = setTimeout(() => poll(current), 1350 + Math.random() * 250)
}

async function poll(current) {
  if (current !== version || (room.status === 'ended' && !pending)) return
  try {
    const data = await api(roomPath(room.pin, `?role=${role}&since=${room.revision}`))
    if (current !== version) return
    if (disconnected) say('')
    disconnected = false
    update(data)
    if (pending) await sendPaint(current)
  } catch (error) {
    if (current !== version) return
    if ([401, 403, 404].includes(error.status)) {
      if (role === 'host' && error.status === 401) signedIn = false
      goToEntry(role, room.pin)
      say(error.message)
      return
    }
    disconnected = true
    renderRoom()
    say('Connection interrupted. Reconnecting automatically.')
  } finally {
    schedulePoll(current)
  }
}

async function sendPaint(current) {
  if (!pending || pending.sending || current !== version) return
  pending.sending = true
  try {
    await api(roomPath(room.pin, '/pixels'), pending.data)
    if (current !== version) return
    pending = undefined
    if (disconnected) say('')
    disconnected = false
    const data = await api(roomPath(room.pin, '?role=guest'))
    if (current === version) update(data)
  } catch (error) {
    if (current !== version) return
    if (error.status) {
      pending = undefined
      say(error.message)
    } else {
      if (pending) pending.sending = false
      disconnected = true
      say(pending ? 'Connection interrupted. Your last square will retry.' : 'Connection interrupted. Reconnecting automatically.')
      renderRoom()
    }
  }
}

async function action(button, work) {
  if (button.disabled) return
  const current = version
  button.disabled = true
  say('')
  try { await work(current) }
  catch (error) {
    if (current === version) say(error.status ? error.message : 'Connection interrupted. Try again.')
  } finally { button.disabled = false }
}

$('join').addEventListener('submit', event => {
  event.preventDefault()
  action(event.submitter, async current => {
    const pin = $('pin').value.trim()
    const key = 'join:' + pin
    const joinKey = sessionStorage.getItem(key) ?? crypto.randomUUID()
    sessionStorage.setItem(key, joinKey)
    const data = await api(roomPath(pin, '/join'), { nickname: $('nickname').value, joinKey })
    sessionStorage.removeItem(key)
    if (current === version) enter(data)
  })
})

$('login').addEventListener('submit', event => {
  event.preventDefault()
  action(event.submitter, async current => {
    await api('/host/login', { passphrase: $('passphrase').value })
    $('passphrase').value = ''
    signedIn = true
    if (current !== version) return
    renderEntry()
    const pin = new URL(location.href).searchParams.get('host')
    if (pinPattern.test(pin ?? '')) {
      const data = await api(roomPath(pin, '?role=host'))
      if (current === version) enter(data)
    }
  })
})

$('create').addEventListener('click', () => action($('create'), async current => {
  const requestId = sessionStorage.getItem('createRoom') ?? crypto.randomUUID()
  sessionStorage.setItem('createRoom', requestId)
  const data = await api('/rooms', { requestId })
  sessionStorage.removeItem('createRoom')
  if (current === version) enter(data)
}))

$('resume').addEventListener('click', () => action($('resume'), async current => {
  const data = await api(roomPath(localStorage.getItem('lastHostPin'), '?role=host'))
  if (current === version) enter(data)
}))

$('logout').addEventListener('click', () => action($('logout'), async current => {
  await api('/host/logout', {})
  signedIn = false
  if (current === version) renderEntry()
}))

for (const command of ['start', 'end']) {
  $(command).addEventListener('click', () => action($(command), async current => {
    const data = await api(roomPath(room.pin, '/' + command), {})
    if (current === version) update(data)
  }))
}

$('copy').addEventListener('click', () => action($('copy'), async current => {
  const invite = new URL('/?pin=' + room.pin, location.href)
  await navigator.clipboard.writeText(invite.href)
  if (current === version) say('Invite link copied.')
}))

$('student-mode').addEventListener('click', () => goToEntry('guest', $('pin').value))
$('host-mode').addEventListener('click', () => {
  goToEntry('host')
  action($('host-mode'), async current => {
    signedIn = (await api('/host')).signedIn
    if (current === version) renderEntry()
  })
})
$('back').addEventListener('click', () => goToEntry(role))

async function restore() {
  const query = new URL(location.href).searchParams
  const hostPin = query.get('host')
  const pin = pinPattern.test(hostPin ?? '') ? hostPin : query.get('pin')
  role = hostPin === pin && pin !== null ? 'host' : 'guest'
  if (role === 'guest' && pinPattern.test(pin ?? '')) $('pin').value = pin
  renderEntry()
  if (!pinPattern.test(pin ?? '')) return
  const current = version
  try {
    if (role === 'host') {
      signedIn = (await api('/host')).signedIn
      if (current !== version) return
      renderEntry()
      if (!signedIn) return
    }
    const data = await api(roomPath(pin, '?role=' + role))
    if (current === version) enter(data)
  } catch (error) {
    if (current === version && error.status !== 401) say(error.status ? error.message : 'Connection interrupted. Try again.')
  }
}
restore()
