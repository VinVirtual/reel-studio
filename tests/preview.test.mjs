// The preview command: the timeline it shows, and the files its local server may hand out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sep } from 'node:path'
import { freshTimeline, safeJoin } from '../engine/lib/preview.mjs'

const word = (w, t, key = false) => ({ w, t, key })
const timeline = () => ({ total: 6, fps: 30, scenes: [
  { id: 'a', type: 'title', title: 'Old title', start: 0.3, voice: 1.2, end: 2, chunks: [{ words: [word('Hello', 0.3), word('there.', 0.7, true)] }] },
  { id: 'b', type: 'bullets', items: ['One'], start: 2, voice: 2, end: 6, chunks: [{ words: [word('Second', 2), word('line.', 2.5)] }] },
] })
const script = (a = {}, b = {}) => ({ scenes: [{ id: 'a', type: 'title', title: 'Old title', say: 'Hello there.', keys: ['there.'], ...a }, { id: 'b', type: 'bullets', items: ['One'], say: 'Second line.', ...b }] })

test('a visual edit shows without making the voice again, and the timing is kept', () => {
  const { timeline: out, stale } = freshTimeline(timeline(), script({ title: 'New title', tone: 'fix' }, { items: ['One', 'Two'] }))
  assert.deepEqual(stale, [])
  assert.equal(out.scenes[0].title, 'New title'); assert.equal(out.scenes[0].tone, 'fix'); assert.deepEqual(out.scenes[1].items, ['One', 'Two'])
  assert.deepEqual([out.scenes[0].start, out.scenes[0].voice, out.scenes[0].end], [0.3, 1.2, 2])
  assert.equal(out.scenes[0].say, undefined); assert.equal(out.total, 6)
})

test('caption highlights follow the keys in the script', () => {
  const { timeline: out } = freshTimeline(timeline(), script({ keys: ['Hello'] }))
  assert.deepEqual(out.scenes[0].chunks[0].words.map((w) => w.key), [true, false])
})

test('the timeline it was given is not changed', () => {
  const before = timeline(), copy = JSON.parse(JSON.stringify(before))
  freshTimeline(before, script({ title: 'New', keys: [] }))
  assert.deepEqual(before, copy)
})

test('a changed line, a new scene and a removed scene are reported as needing the voice again', () => {
  assert.match(freshTimeline(timeline(), script({ say: 'Hello  there, friend.' })).stale[0], /^a: the spoken line changed/)
  assert.deepEqual(freshTimeline(timeline(), script({ say: 'Hello   there.' })).stale, [], 'spacing alone is not a change')
  const more = script(); more.scenes.push({ id: 'c', type: 'title', say: 'More.' })
  assert.match(freshTimeline(timeline(), more).stale[0], /^c: new scene/)
  const fewer = { scenes: script().scenes.slice(0, 1) }, r = freshTimeline(timeline(), fewer)
  assert.match(r.stale[0], /^b: no longer in the script/); assert.equal(r.timeline.scenes.length, 2, 'it still plays what was voiced')
  const swapped = { scenes: script().scenes.reverse() }
  assert.deepEqual(freshTimeline(timeline(), swapped).stale, ['the scenes changed order'])
})

test('the server only hands out files inside the project', () => {
  assert.equal(safeJoin('/p/proj', 'assets/a.png'), `${sep}p${sep}proj${sep}assets${sep}a.png`)
  assert.equal(safeJoin('/p/proj', '/custom.js'), `${sep}p${sep}proj${sep}custom.js`)
  assert.equal(safeJoin('/p/proj', '../other/secret'), null)
  assert.equal(safeJoin('/p/proj', 'a/../../proj-two/x'), null)
  assert.equal(safeJoin('/p/proj', '..'), null)
})

/* ---------- the server, over HTTP ---------- */
import { request } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startPreview, parseRange, allowedHost } from '../engine/lib/preview.mjs'

/** a tiny project with a voice track of 1000 known bytes, a dot-file, and a link to a file outside it */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'reel-preview-')), P = join(root, 'proj')
  mkdirSync(join(P, 'build', 'script'), { recursive: true }); mkdirSync(join(P, 'assets'))
  writeFileSync(join(P, 'brand.json'), '{}'); writeFileSync(join(P, 'script.json'), JSON.stringify(script()))
  writeFileSync(join(P, 'build', 'script.timeline.json'), JSON.stringify(timeline()))
  writeFileSync(join(P, 'build', 'script', 'mix.wav'), Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)))
  writeFileSync(join(P, 'assets', 'a.png'), 'png'); writeFileSync(join(P, '.env'), 'SECRET=1')
  writeFileSync(join(root, 'outside.txt'), 'outside'); symlinkSync(join(root, 'outside.txt'), join(P, 'assets', 'link.txt'))
  return { root, P }
}
function get(port, path, headers = {}) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const parts = []; res.on('data', (d) => parts.push(d)); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }))
    })
    req.on('error', fail); req.end()
  })
}
async function withServer(fn) {
  const { root, P } = project(), { server, url } = await startPreview({ P, name: 'script', port: 0 })
  try { await fn(Number(new URL(url).port), P) } finally { server.close(); rmSync(root, { recursive: true, force: true }) }
}

test('parseRange: one range, open ranges, suffix ranges, and what cannot be served', () => {
  assert.equal(parseRange(undefined, 100), null); assert.equal(parseRange('items=0-5', 100), null); assert.equal(parseRange('bytes=0-1,5-6', 100), null)
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 })
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 })
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 })
  for (const bad of ['bytes=100-', 'bytes=20-10', 'bytes=-', 'bytes=-0', 'bytes=a-b']) assert.equal(parseRange(bad, 100), 'unsatisfiable', bad)
})

test('allowedHost: only this port on loopback names', () => {
  for (const ok of ['127.0.0.1:4173', 'localhost:4173', 'LOCALHOST:4173', '[::1]:4173']) assert.ok(allowedHost(ok, 4173), ok)
  for (const bad of ['evil.example:4173', '127.0.0.1:80', '127.0.0.1', '', undefined]) assert.ok(!allowedHost(bad, 4173), String(bad))
})

test('the audio is served in byte ranges, so the player can seek', () => withServer(async (port) => {
  const all = await get(port, '/audio')
  assert.equal(all.status, 200); assert.equal(all.headers['accept-ranges'], 'bytes'); assert.equal(all.body.length, 1000)
  const part = await get(port, '/audio', { range: 'bytes=500-509' })
  assert.equal(part.status, 206); assert.equal(part.headers['content-range'], 'bytes 500-509/1000'); assert.equal(part.headers['content-length'], '10')
  assert.deepEqual([...part.body], Array.from({ length: 10 }, (_, i) => (500 + i) % 256))
  const tail = await get(port, '/audio', { range: 'bytes=990-' })
  assert.equal(tail.status, 206); assert.equal(tail.body.length, 10)
  const bad = await get(port, '/audio', { range: 'bytes=5000-' })
  assert.equal(bad.status, 416); assert.equal(bad.headers['content-range'], 'bytes */1000')
}))

test('the server answers only to its own host names', () => withServer(async (port) => {
  assert.equal((await get(port, '/audio', { host: 'evil.example' })).status, 403)
  assert.equal((await get(port, '/audio', { host: `evil.example:${port}` })).status, 403)
  assert.equal((await get(port, '/audio', { host: `localhost:${port}` })).status, 200)
}))

test('project files: no hidden files, no way out, no links out', () => withServer(async (port) => {
  assert.equal((await get(port, '/project/assets/a.png')).status, 200)
  for (const path of ['/project/.env', '/project/.git/config', '/project/assets/..%2F.env', '/project/..%2F..%2Fetc%2Fpasswd', '/project/assets/link.txt'])
    assert.equal((await get(port, path)).status, 404, path)
}))

test('a file that vanishes or cannot be read is an error answer, and the server keeps running', { skip: process.getuid && process.getuid() === 0 ? 'root can read any file' : false }, () => withServer(async (port, P) => {
  const wav = join(P, 'build', 'script', 'mix.wav')
  chmodSync(wav, 0o000)
  assert.equal((await get(port, '/audio')).status, 500)
  chmodSync(wav, 0o644); unlinkSync(wav)
  assert.equal((await get(port, '/audio')).status, 404)
  writeFileSync(wav, 'back again')
  assert.equal((await get(port, '/audio')).body.toString(), 'back again')
}))
