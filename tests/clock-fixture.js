// The local runner copies this into a disposable Worker. It is outside the deployment entrypoint.
import app, { Rooms as RoomCore } from './worker.js'

export class Rooms extends RoomCore {
  async expireForTest(pin) {
    this.sql.exec('UPDATE rooms SET expires_at = ? WHERE pin = ?', Date.now() - 1, pin)
  }

  async sweepForTest(pin) {
    const room = this.one('SELECT id FROM rooms WHERE pin = ?', pin)
    await this.alarm()
    const remaining = this.one('SELECT 1 FROM rooms WHERE pin = ?', pin)
    const guests = this.one('SELECT count(*) AS count FROM guests WHERE room_id = ?', room.id)
    return { found: Boolean(remaining), guestRows: guests.count }
  }
}

export default {
  fetch(request, env) {
    const match = /^\/__test\/(expire|sweep)\/(\d{8})$/.exec(new URL(request.url).pathname)
    if (!match) return app.fetch(request, env)
    if (request.headers.get('X-Fixture-Key') !== env.HOST_SIGNING_KEY) return new Response(null, { status: 404 })
    const store = env.ROOMS.getByName('classroom-v1')
    if (match[1] === 'sweep') return store.sweepForTest(match[2]).then(result => Response.json(result))
    return store.expireForTest(match[2]).then(() => new Response(null, { status: 204 }))
  },
}
