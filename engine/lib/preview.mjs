// The preview command: a page on this machine that plays a script with its voice and lets you scrub through it,
// drawn live by the same engine that renders the video. Nothing is encoded, so a visual change shows at once.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, realpathSync, createReadStream } from 'node:fs'
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

/** A path under `root`, or null when `rel` tries to leave it, names a hidden file or folder (a segment that
    starts with ".", such as .env or .git/config), or reaches outside `root` through a symbolic link. */
export function safeJoin(root, rel) {
  if (rel.split(/[/\\]+/).some((seg) => seg.startsWith('.'))) return null
  const base = resolve(root), full = resolve(base, '.' + sep + rel.replace(/^[/\\]+/, ''))
  if (!(full === base || full.startsWith(base + sep))) return null
  if (!existsSync(full)) return full // the caller answers 404
  try {
    const realBase = realpathSync(base), real = realpathSync(full)
    return real === realBase || real.startsWith(realBase + sep) ? full : null
  } catch { return null }
}

/** The byte range a Range header asks for, in a file of `size` bytes.
    Returns null to send the whole file (no header, a header in another unit, or several ranges),
    { start, end } (both inclusive) for one satisfiable range, or 'unsatisfiable' (answer 416). */
export function parseRange(header, size) {
  if (!header) return null
  const m = /^bytes=(.*)$/i.exec(String(header).trim()); if (!m) return null
  if (m[1].includes(',')) return null
  const r = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(m[1]); if (!r || (r[1] === '' && r[2] === '')) return 'unsatisfiable'
  let start, end
  if (r[1] === '') { const n = Number(r[2]); if (!n) return 'unsatisfiable'; start = Math.max(0, size - n); end = size - 1 }
  else { start = Number(r[1]); end = r[2] === '' ? size - 1 : Math.min(Number(r[2]), size - 1) }
  return start > end || start >= size ? 'unsatisfiable' : { start, end }
}

/** is a Host header one of this server's own loopback names? (anything else may be DNS rebinding) */
export function allowedHost(host, port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(host || '').toLowerCase())
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
export function startPreview({ P, name, format, port: wanted = 4173 }) {
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
  // a file, or the byte range of it that the browser asks for (the audio element needs ranges to seek).
  // The file can vanish or become unreadable while `reel audio` rewrites it; that is a 404 or 500, never a crash.
  const file = (req, res, path) => {
    let size
    try { const st = path && statSync(path); if (!st || !st.isFile()) return send(res, 404, 'not found'); size = st.size } catch { return send(res, 404, 'not found') }
    const range = parseRange(req.headers.range, size), type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream'
    if (range === 'unsatisfiable') { res.writeHead(416, { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }); return res.end() }
    const { start, end } = range || { start: 0, end: size - 1 }
    const stream = createReadStream(path, size ? { start, end } : {})
    stream.once('error', (e) => {
      if (!res.headersSent) send(res, e.code === 'ENOENT' ? 404 : 500, e.code === 'ENOENT' ? 'not found' : 'could not read the file')
      else res.destroy()
    })
    stream.once('open', () => {
      res.writeHead(range ? 206 : 200, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-length': size ? end - start + 1 : 0,
        ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) })
      stream.pipe(res)
    })
    res.once('close', () => stream.destroy())
  }
  let port = 0
  const server = createServer((req, res) => {
    try {
      if (!allowedHost(req.headers.host, port)) return send(res, 403, 'this preview only answers to 127.0.0.1, localhost or [::1]')
      const url = new URL(req.url, 'http://x'), path = decodeURIComponent(url.pathname)
      if (path === '/') return send(res, 200, readFileSync(join(ENGINE, 'preview.html')), TYPES['.html'])
      if (path === '/state') return send(res, 200, JSON.stringify(previewState(P, name, format)), TYPES['.json'])
      if (path === '/audio') return file(req, res, join(P, 'build', name, 'mix.wav'))
      if (path.startsWith('/font/')) { const brand = loadBrand(P), role = path.slice(6); return file(req, res, fontPath(P, brand.fonts?.[role] || (role === 'mono' ? MONO_FONT : null))) }
      if (path.startsWith('/engine/')) return /^\/engine\/[\w-]+\.js$/.test(path) ? file(req, res, join(ENGINE, path.slice(8))) : send(res, 404, 'not found')
      if (path.startsWith('/project/')) return file(req, res, safeJoin(P, path.slice(9)))
      send(res, 404, 'not found')
    } catch (e) { if (!res.headersSent) send(res, 500, String(e && e.message || e)); else res.destroy() }
  })
  return new Promise((done, fail) => {
    server.once('error', (e) => fail(e.code === 'EADDRINUSE' ? new Error(`port ${wanted} is in use. Pick another with --port`) : e))
    server.listen(wanted, '127.0.0.1', () => { port = server.address().port; done({ server, url: `http://127.0.0.1:${port}/` }) })
  })
}
