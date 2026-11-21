// The build command: voice + video (+ web export) for many scripts of one project, a few at a time.
// A script whose inputs have not changed is skipped; one failure does not stop the others.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { ENGINE, findPython } from './env.mjs'
import { loadBrand, fontPath } from './project.mjs'

const hashOf = (parts) => { const h = createHash('sha1'); for (const p of parts) h.update(typeof p === 'string' ? p : p ?? ''); return h.digest('hex') }
const fileOr = (path) => (existsSync(path) ? readFileSync(path) : '')
const engineFiles = () => [...readdirSync(ENGINE), ...readdirSync(join(ENGINE, 'lib')).map((f) => join('lib', f))].filter((f) => /\.(js|mjs|html)$/.test(f)).sort().map((f) => readFileSync(join(ENGINE, f)))

/** Fingerprints of everything a script's outputs depend on: { audio, video, web }. */
export function fingerprints(P, name, options = {}) {
  const script = fileOr(join(P, `${name}.json`)), brandText = fileOr(join(P, 'brand.json'))
  let assets = []
  try {
    const brand = loadBrand(P), sc = JSON.parse(String(script))
    const images = [brand.logo, ...sc.scenes.flatMap((s) => [s.src, ...(s.images || [])])].filter(Boolean).map((f) => join(P, f))
    assets = [...images, fontPath(P, brand.fonts?.display), fontPath(P, brand.fonts?.body)].filter(Boolean)
  } catch {} // a broken script still gets a fingerprint; the build step reports the real error
  const audio = hashOf([script, brandText, fileOr(join(ENGINE, 'gen_audio.py'))])
  const video = hashOf([audio, fileOr(join(P, 'custom.js')), ...assets.map(fileOr), ...engineFiles(), JSON.stringify({ captions: options.captions, lossless: options.lossless, quality: options.quality })])
  const web = hashOf([video, JSON.stringify({ size: options.webSize, crf: options.webCrf, dir: options.webDir, posterAt: options.posterAt })])
  return { audio, video, web }
}

/** which steps a script needs, given its saved fingerprints and the files on disk */
export function planSteps(now, saved, have, { web = false, force = false } = {}) {
  const audio = force || saved.audio !== now.audio || !have.audio
  const video = audio || saved.video !== now.video || !have.video
  return { audio, video, web: web && (video || saved.web !== now.web || !have.web) }
}

function run(cmd, args, logStream) {
  return new Promise((done) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const take = (d) => { logStream.write(d); tail = (tail + d).slice(-2000) }
    c.stdout.on('data', take); c.stderr.on('data', take)
    c.on('error', (e) => done({ ok: false, tail: `could not start ${cmd}: ${e.message}` }))
    c.on('close', (code) => done({ ok: code === 0, tail }))
  })
}

async function buildOne(P, name, o) {
  const t0 = Date.now(), stampPath = join(P, 'build', `${name}.stamp.json`), webDir = o.webDir || join(P, 'out', 'web')
  let saved = {}; try { saved = JSON.parse(readFileSync(stampPath, 'utf8')) } catch {}
  const now = fingerprints(P, name, o)
  const have = { audio: existsSync(join(P, 'build', `${name}.timeline.json`)) && existsSync(join(P, 'build', name, 'mix.wav')), video: existsSync(join(P, 'out', `${name}.mp4`)),
    web: existsSync(join(webDir, `${name}.mp4`)) && existsSync(join(webDir, `${name}.jpg`)) }
  const plan = planSteps(now, saved, have, o)
  if (!plan.audio && !plan.video && !plan.web) return { name, status: 'skipped', seconds: 0 }
  mkdirSync(join(P, 'build'), { recursive: true })
  const logPath = join(P, 'build', `${name}.build.log`), log = createWriteStream(logPath)
  const cli = join(ENGINE, 'cli.mjs'), common = [P, name, ...(o.captions === false ? ['--no-captions'] : [])]
  const steps = [
    plan.audio && ['audio', findPython(), [join(ENGINE, 'gen_audio.py'), P, name]],
    plan.video && ['video', process.execPath, [cli, 'video', ...common, '--workers', String(o.workers), ...(o.lossless ? ['--lossless'] : []), ...(o.quality ? ['--quality', String(o.quality)] : [])]],
    plan.web && ['web', process.execPath, [cli, 'web', ...common, ...(o.webSize ? ['--web-size', String(o.webSize)] : []), ...(o.webCrf ? ['--web-crf', String(o.webCrf)] : []), ...(o.webDir ? ['--web-dir', o.webDir] : []), ...(o.posterAt !== undefined ? ['--poster-at', String(o.posterAt)] : [])]],
  ].filter(Boolean)
  const done = { ...saved }
  for (const [step, cmd, args] of steps) {
    const r = await run(cmd, args, log)
    if (!r.ok) { log.end(); writeFileSync(stampPath, JSON.stringify(done)); return { name, status: 'failed', step, seconds: (Date.now() - t0) / 1000, tail: r.tail.trim().split('\n').slice(-6).join('\n'), logPath } }
    done[step] = now[step]
  }
  log.end(); writeFileSync(stampPath, JSON.stringify(done))
  return { name, status: 'built', steps: steps.map((s) => s[0]), seconds: (Date.now() - t0) / 1000 }
}

/** Build `names` with at most `jobs` at once. Returns one result per script, in the order given. */
export async function buildMany(P, names, options, onResult = () => {}) {
  const results = new Array(names.length); let next = 0
  const worker = async () => {
    while (next < names.length) {
      const i = next++
      try { results[i] = await buildOne(P, names[i], options) } catch (e) { results[i] = { name: names[i], status: 'failed', step: 'setup', seconds: 0, tail: String(e.message || e) } }
      onResult(results[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.jobs, names.length) }, worker))
  return results
}

export function summary(results) {
  const by = (s) => results.filter((r) => r.status === s)
  const lines = [`${by('built').length} built, ${by('skipped').length} unchanged, ${by('failed').length} failed`]
  for (const r of by('failed')) lines.push(`FAILED ${r.name} (${r.step} step)${r.logPath ? `  log: ${r.logPath}` : ''}`, ...String(r.tail || '').split('\n').map((l) => '    ' + l))
  return lines.join('\n')
}
