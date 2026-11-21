// The preview command: a page on this machine that plays a script with its voice and lets you scrub through it,
// drawn live by the same engine that renders the video. Nothing is encoded, so a visual change shows at once.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs'
import { join, resolve, sep, extname } from 'node:path'
import { ENGINE } from './env.mjs'
import { loadBrand, loadTimeline, loadScript, fontPath, withFormat, MONO_FONT } from './project.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' }

/** The timeline with each scene's look taken from the script as it is now, so edits to titles, items, colours of
    a scene and so on show without making the voice again. Timing stays the timeline's. `stale` lists what only
    `reel audio` can bring up to date: scenes whose spoken line changed, and scenes added, removed or moved. */
export function freshTimeline(timeline, script) {
  const now = Array.isArray(script?.scenes) ? script.scenes : [], stale = []
  const byId = new Map(now.filter((s) => s && s.id).map((s) => [s.id, s]))
  const scenes = timeline.scenes.map((old) => {
    const sc = byId.get(old.id)
    if (!sc) { stale.push(`${old.id}: no longer in the script`); return old }
    const spoken = old.chunks.flatMap((c) => c.words.map((w) => w.w)).join(' ')
    if (String(sc.say || '').split(/\s+/).filter(Boolean).join(' ') !== spoken) stale.push(`${old.id}: the spoken line changed`)
    const keys = new Set(sc.keys || []), { say, keys: _k, ...data } = sc
    return { ...data, start: old.start, voice: old.voice, end: old.end, chunks: old.chunks.map((c) => ({ words: c.words.map((w) => ({ ...w, key: keys.has(w.w) })) })) }
  })
  const had = new Set(timeline.scenes.map((s) => s.id))
  for (const s of now) if (s && s.id && !had.has(s.id)) stale.push(`${s.id}: new scene, not voiced yet`)
  if (!stale.length && now.map((s) => s.id).join() !== timeline.scenes.map((s) => s.id).join()) stale.push('the scenes changed order')
  return { timeline: { ...timeline, scenes }, stale }
}

/** a path under `root`, or null when `rel` tries to leave it */
export function safeJoin(root, rel) {
  const base = resolve(root), full = resolve(base, '.' + sep + rel.replace(/^[/\\]+/, ''))
  return full === base || full.startsWith(base + sep) ? full : null
}

/** what the page needs to set the engine up: timeline, brand, font and custom.js addresses, and a version that changes when a file does */
export function previewState(P, name, format) {
  const brand = withFormat(loadBrand(P), format).brand
  const { timeline, stale } = freshTimeline(loadTimeline(P, name), loadScript(P, name))
  const fonts = {}, watched = [join(P, 'brand.json'), join(P, `${name}.json`), join(P, 'build', `${name}.timeline.json`), join(P, 'custom.js'), join(P, 'build', name, 'mix.wav')]
  for (const role of ['display', 'body', 'mono']) { const f = brand.fonts?.[role] || (role === 'mono' ? MONO_FONT : null); fonts[role] = { ...(f || {}), url: fontPath(P, f) ? `/font/${role}` : undefined } }
  const version = watched.map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)).join('-')
  return { timeline, brand, fonts, stale, custom: existsSync(join(P, 'custom.js')) ? `/project/custom.js?v=${version}` : null, name, version }
}

/** Start the preview server on 127.0.0.1. Returns { server, url }. */
export function startPreview({ P, name, format, port = 4173 }) {
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
  const file = (res, path) => {
    if (!path || !existsSync(path) || !statSync(path).isFile()) return send(res, 404, 'not found')
    res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'content-length': statSync(path).size })
    createReadStream(path).pipe(res)
  }
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x'), path = decodeURIComponent(url.pathname)
      if (path === '/') return send(res, 200, readFileSync(join(ENGINE, 'preview.html')), TYPES['.html'])
      if (path === '/state') return send(res, 200, JSON.stringify(previewState(P, name, format)), TYPES['.json'])
      if (path === '/audio') return file(res, join(P, 'build', name, 'mix.wav'))
      if (path.startsWith('/font/')) { const brand = loadBrand(P), role = path.slice(6); return file(res, fontPath(P, brand.fonts?.[role] || (role === 'mono' ? MONO_FONT : null))) }
      if (path.startsWith('/engine/')) return /^\/engine\/[\w-]+\.js$/.test(path) ? file(res, join(ENGINE, path.slice(8))) : send(res, 404, 'not found')
      if (path.startsWith('/project/')) return file(res, safeJoin(P, path.slice(9)))
      send(res, 404, 'not found')
    } catch (e) { send(res, 500, String(e && e.message || e)) }
  })
  return new Promise((done, fail) => {
    server.once('error', (e) => fail(e.code === 'EADDRINUSE' ? new Error(`port ${port} is in use. Pick another with --port`) : e))
    server.listen(port, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}/` }))
  })
}
