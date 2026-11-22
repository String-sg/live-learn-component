import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const dir = await mkdtemp(join(tmpdir(), 'live-learn-'))
const base = 'http://127.0.0.1:8788'
const secrets = {
  HOST_PASSPHRASE: crypto.randomUUID() + crypto.randomUUID(),
  HOST_SIGNING_KEY: crypto.randomUUID() + crypto.randomUUID(),
}
const environment = {
  ...process.env, ...secrets, BASE_URL: base, LL_TEST_FIXTURE: '1',
  WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(dir, 'wrangler.log'),
}
const node = (args, env = environment) => spawn(process.execPath, args, { env, stdio: 'inherit' })

async function run(args) {
  const [code] = await once(node(args), 'exit')
  if (code !== 0) throw new Error('Test command exited with code ' + code)
}

let server, serverExit

async function startServer() {
  server = node(['node_modules/wrangler/bin/wrangler.js', 'dev', '--cwd', dir, '--ip', '127.0.0.1',
    '--port', '8788', '--inspector-port', '0'])
  serverExit = once(server, 'exit')
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Test Worker exited before it was ready.')
    try {
      const response = await fetch(base + '/api/host', { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Test Worker did not become ready.')
}

async function stopServer() {
  if (server && server.exitCode === null) {
    server.kill()
    await serverExit
  }
}

try {
  await Promise.all(['src', 'public'].map(path => cp(path, join(dir, path), { recursive: true })))
  const config = (await readFile('wrangler.jsonc', 'utf8')).replace('src/worker.js', 'src/clock-fixture.js')
  await writeFile(join(dir, 'wrangler.jsonc'), config)
  await cp('tests/clock-fixture.js', join(dir, 'src/clock-fixture.js'))
  await writeFile(join(dir, '.dev.vars'), Object.entries(secrets).map(pair => pair.join('=')).join('\n'), { mode: 0o600 })
  if (process.argv.includes('--upgrade')) {
    const baseline = '13367f2a6fe2125b3303f68eb295d515b9d7d600'
    for (const file of ['worker.js', 'host-auth.js', 'rooms.js']) {
      await writeFile(join(dir, 'src', file), execFileSync('git', ['show', baseline + ':src/' + file]))
    }
    // Start the original entrypoint to create real pre-change data.
    await writeFile(join(dir, 'wrangler.jsonc'), await readFile('wrangler.jsonc'))
    await startServer()
    const { prepareUpgrade, verifyUpgrade } = await import('./upgrade.js')
    const state = await prepareUpgrade(base, secrets.HOST_PASSPHRASE)
    await stopServer()
    await cp('src', join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'wrangler.jsonc'), config)
    await startServer()
    await verifyUpgrade(state)
  } else {
    await startServer()
  }
  await run(['--test', '--test-concurrency=1', 'tests/acceptance.test.js', 'tests/security.test.js'])
  await run(['node_modules/@playwright/test/cli.js', 'test'])
} finally {
  await stopServer()
  await rm(dir, { recursive: true, force: true })
}
