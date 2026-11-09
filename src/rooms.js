import { DurableObject } from 'cloudflare:workers'

const ttl = 2 * 60 * 60 * 1000
const sweepInterval = 15 * 60 * 1000
const guestLimit = 120
const paintLimit = 30000
const failureLimit = 30
const error = (status, message) => ({ status, error: message })

function snapshot(room, nickname) {
  const { pin, status, pixels, revision, guests, expires_at: expiresAt } = room
  return { pin, status, pixels, revision, guests, expiresAt, nickname }
}

export class Rooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL, pin TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL, pixels TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        guests INTEGER NOT NULL DEFAULT 0, paints INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL,
        UNIQUE(owner, request_id)
      );
      CREATE TABLE IF NOT EXISTS guests (
        room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE, secret TEXT NOT NULL, nickname TEXT NOT NULL,
        PRIMARY KEY (room_id, secret)
      );
      CREATE TABLE IF NOT EXISTS paints (
        room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE, guest TEXT NOT NULL, op TEXT NOT NULL,
        cell INTEGER NOT NULL, colour INTEGER NOT NULL, revision INTEGER NOT NULL,
        PRIMARY KEY (room_id, guest, op)
      );
      CREATE TABLE IF NOT EXISTS join_failures (
        source TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL
      );
    `)
  }

  one(query, ...args) {
    return this.sql.exec(query, ...args).toArray()[0]
  }

  async create(owner, requestId) {
    await this.scheduleSweep()
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      this.sql.exec('DELETE FROM rooms WHERE expires_at <= ?', now)
      const existing = this.one('SELECT * FROM rooms WHERE owner = ? AND request_id = ?', owner, requestId)
      if (existing) return snapshot(existing)
      const { count } = this.one("SELECT count(*) AS count FROM rooms WHERE owner = ? AND status != 'ended'", owner)
      if (count >= 10) return error(429, 'End one of your open rooms before creating another.')
      let pin
      do {
        pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, '0')
      } while (this.one('SELECT 1 FROM rooms WHERE pin = ?', pin))
      const room = this.one(`
        INSERT INTO rooms (id, owner, request_id, pin, status, pixels, expires_at)
        VALUES (?, ?, ?, ?, 'waiting', ?, ?) RETURNING *
      `, crypto.randomUUID(), owner, requestId, pin, '0'.repeat(256), now + ttl)
      return snapshot(room)
    })
  }

  async join(pin, secret, nickname, source, resumeSecret) {
    await this.scheduleSweep()
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now()
      const window = Math.floor(now / 60000)
      const room = this.one('SELECT * FROM rooms WHERE pin = ? AND expires_at > ?', pin, now)
      if (room && resumeSecret) {
        const existing = this.one('SELECT nickname FROM guests WHERE room_id = ? AND secret = ?', room.id, resumeSecret)
        if (existing) return { room: snapshot(room, existing.nickname), resumed: true }
      }
      if (room) {
        const existing = this.one('SELECT nickname FROM guests WHERE room_id = ? AND secret = ?', room.id, secret)
        if (existing) return { room: snapshot(room, existing.nickname), resumed: false }
      }
      const failures = this.one('SELECT attempts FROM join_failures WHERE source = ? AND window = ?', source, window)
      if (failures?.attempts >= failureLimit) return error(429, 'Too many failed attempts. Try again in a minute.')
      if (!room || room.status === 'ended') {
        this.sql.exec(`
          INSERT INTO join_failures VALUES (?, ?, 1)
          ON CONFLICT(source) DO UPDATE SET
            attempts = CASE WHEN window = excluded.window THEN attempts + 1 ELSE 1 END,
            window = excluded.window
        `, source, window)
        return room ? error(409, 'This room has ended.') : error(404, 'This PIN is incorrect or has expired.')
      }
      if (room.guests >= guestLimit) return error(409, 'This room is full.')
      this.sql.exec('INSERT INTO guests VALUES (?, ?, ?)', room.id, secret, nickname)
      const updated = this.one('UPDATE rooms SET guests = guests + 1, revision = revision + 1 WHERE id = ? RETURNING *', room.id)
      return { room: snapshot(updated, nickname), resumed: false }
    })
  }

  read(pin, host, secret, since) {
    const access = this.access(pin, host, secret)
    if (access.error) return access
    if (since === access.room.revision) return { status: 204 }
    return snapshot(access.room, access.guest?.nickname)
  }

  transition(pin, host, action) {
    const access = this.access(pin, host, '')
    if (access.error) return access
    const { room } = access
    const next = action === 'start' ? 'live' : 'ended'
    if (room.status === next) return snapshot(room)
    if (room.status === 'ended') return error(409, 'This room has ended.')
    return snapshot(this.one('UPDATE rooms SET status = ?, revision = revision + 1 WHERE id = ? RETURNING *', next, room.id))
  }

  paint(pin, secret, op, cell, colour) {
    return this.ctx.storage.transactionSync(() => {
      const access = this.access(pin, null, secret)
      if (access.error) return access
      const { room } = access
      const receipt = this.one('SELECT * FROM paints WHERE room_id = ? AND guest = ? AND op = ?', room.id, secret, op)
      if (receipt) {
        if (receipt.cell !== cell || receipt.colour !== colour) return error(409, 'This operation ID already has a different paint.')
        return { revision: receipt.revision }
      }
      if (room.status !== 'live') return error(409, room.status === 'waiting' ? 'The host has not started yet.' : 'This room has ended.')
      if (room.paints >= paintLimit) return error(429, 'This room has reached its paint limit.')
      const pixels = room.pixels.slice(0, cell) + colour + room.pixels.slice(cell + 1)
      const revision = room.revision + 1
      this.sql.exec('UPDATE rooms SET pixels = ?, revision = ?, paints = paints + 1 WHERE id = ?', pixels, revision, room.id)
      this.sql.exec('INSERT INTO paints VALUES (?, ?, ?, ?, ?, ?)', room.id, secret, op, cell, colour, revision)
      return { revision }
    })
  }

  access(pin, host, secret) {
    if (!host && !secret) return error(401, 'Join this room or sign in as its host.')
    const room = this.one('SELECT * FROM rooms WHERE pin = ? AND expires_at > ?', pin, Date.now())
    if (!room) return error(404, 'This PIN is incorrect or has expired.')
    if (host) return room.owner === host ? { room } : error(403, 'This room belongs to another host.')
    const guest = this.one('SELECT nickname FROM guests WHERE room_id = ? AND secret = ?', room.id, secret)
    return guest ? { room, guest } : error(403, 'Join this room to access it.')
  }

  async scheduleSweep() {
    if (await this.ctx.storage.getAlarm() === null) {
      await this.ctx.storage.setAlarm(Date.now() + sweepInterval)
    }
  }

  async alarm() {
    const now = Date.now()
    this.sql.exec('DELETE FROM rooms WHERE expires_at <= ?', now)
    this.sql.exec('DELETE FROM join_failures WHERE window < ?', Math.floor(now / 60000))
    if (this.one('SELECT 1 FROM rooms LIMIT 1') || this.one('SELECT 1 FROM join_failures LIMIT 1')) {
      await this.ctx.storage.setAlarm(now + sweepInterval)
    }
  }
}
