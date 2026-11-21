// Rendering: stills, review sheet, video, caption files, web export and poster.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { findFF, CPUS } from './env.mjs'
import { openStage, grab, settledTime } from './stage.mjs'
import { toVtt, toSrt } from './captions.mjs'

/** run ffmpeg to the end; `input` (a Buffer) is written to its stdin when given */
export function ffmpeg(FF, args, input) {
  return new Promise((done, fail) => {
    const c = spawn(FF, ['-y', '-loglevel', 'error', ...args], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] })
    c.on('error', (e) => fail(new Error(`could not start ffmpeg (${FF}): ${e.message}`)))
    c.on('close', (code) => (code ? fail(new Error('ffmpeg exited with code ' + code)) : done()))
    if (input) { c.stdin.on('error', () => {}); c.stdin.end(input) }
  })
}

// BT.709 in limited range, tagged, so browsers and phones show the brand colours as drawn
const COLOUR = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bicubic,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv']

export async function renderStills({ P, name, brand, timeline, opts, times, log }) {
  const dir = join(P, 'stills'); mkdirSync(dir, { recursive: true })
  const stage = await openStage({ P, brand, timeline, opts, log })
  try {
    const out = []
    for (const t of times) { const f = join(dir, `${name}-t-${t.toFixed(2)}.png`); writeFileSync(f, await grab(stage.pages[0], t)); out.push(f) }
    return out
  } finally { await stage.close() }
}

/** one frame per scene, taken when the scene is fully built, tiled into one PNG */
export async function renderSheet({ P, name, brand, timeline, opts, log }) {
  const FF = findFF(), dir = join(P, 'stills'), tmp = join(dir, `.sheet-${name}`)
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true })
  const stage = await openStage({ P, brand, timeline, opts, log })
  try {
    const times = timeline.scenes.map((s, i) => settledTime(s, i === timeline.scenes.length - 1))
    for (const [i, t] of times.entries()) writeFileSync(join(tmp, `f${String(i).padStart(3, '0')}.png`), await grab(stage.pages[0], t))
    const wide = stage.size.W > stage.size.H, cols = Math.min(wide ? 3 : 5, times.length), rows = Math.ceil(times.length / cols), out = join(dir, `${name}-sheet.png`)
    await ffmpeg(FF, ['-framerate', '1', '-i', join(tmp, 'f%03d.png'), '-vf', `scale=${wide ? 640 : 360}:-1,tile=${cols}x${rows}:padding=8:color=black`, '-frames:v', '1', out])
    return { out, legend: timeline.scenes.map((s, i) => `${i + 1}=${s.id}@${times[i].toFixed(1)}s`).join('  ') }
  } finally { await stage.close(); rmSync(tmp, { recursive: true, force: true }) }
}

/** out/<name>.vtt and .srt from the timeline */
export function writeCaptions({ P, name, timeline }) {
  const dir = join(P, 'out'); mkdirSync(dir, { recursive: true })
  const vtt = join(dir, `${name}.vtt`), srt = join(dir, `${name}.srt`)
  writeFileSync(vtt, toVtt(timeline)); writeFileSync(srt, toSrt(timeline))
  return { vtt, srt }
}

export const defaultWorkers = (jobs = 1) => Math.max(1, Math.min(4, Math.floor(CPUS / 2 / Math.max(1, jobs))))

/** Every frame drawn in `workers` pages at once (a frame depends only on t, so order does not matter),
    then written to ffmpeg in order. Frames travel as JPEG by default, or PNG with lossless: true. */
export async function renderVideo({ P, name, brand, timeline, opts, workers = defaultWorkers(), lossless = false, quality = 0.95, log }) {
  const FF = findFF(), dir = join(P, 'out'); mkdirSync(dir, { recursive: true })
  const mix = join(P, 'build', name, 'mix.wav'), voice = join(P, 'build', name, 'voice.wav')
  if (!existsSync(mix)) throw new Error(`no audio for "${name}" (${mix}). Make the voice first: reel audio ${P} ${name}`)
  const out = join(dir, `${name}.mp4`), fps = timeline.fps || 30, n = Math.round(timeline.total * fps), type = lossless ? 'png' : 'jpeg'
  const stage = await openStage({ P, brand, timeline, opts, pages: Math.min(workers, n), log })
  const t0 = Date.now()
  try {
    const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', lossless ? 'png' : 'mjpeg', '-i', '-', '-i', mix,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', ...COLOUR, '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
    let dead = null
    const closed = new Promise((r) => ff.on('close', (code) => { if (code) dead = new Error('ffmpeg exited with code ' + code); r() }))
    ff.on('error', (e) => { dead = new Error(`could not start ffmpeg (${FF}): ${e.message}`) })
    ff.stdin.on('error', (e) => { dead = dead || new Error('ffmpeg stopped reading frames: ' + e.message) })
    // frames arrive out of order from the pages; `next` is the frame ffmpeg is waiting for
    const ready = new Map(); let next = 0, writing = Promise.resolve()
    const flush = async () => {
      while (ready.has(next) && !dead) {
        const buf = ready.get(next); ready.delete(next); next++
        if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), closed])
        if (next % 300 === 0) log(`frame ${next}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`)
      }
    }
    const K = stage.pages.length
    await Promise.all(stage.pages.map(async (page, k) => {
      for (let i = k; i < n; i += K) {
        while (i - next > 48 && !dead) await new Promise((r) => setTimeout(r, 5)) // do not run far ahead of the encoder
        if (dead) return
        ready.set(i, await grab(page, i / fps, type, quality)); writing = writing.then(flush)
      }
    }))
    await writing
    ff.stdin.end(); await closed
    if (dead) throw dead
    await ffmpeg(FF, ['-i', out, '-i', voice, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out.replace(/\.mp4$/, '-voiceonly.mp4')])
    return { out, seconds: (Date.now() - t0) / 1000, frames: n, workers: K, size: stage.size, ...writeCaptions({ P, name, timeline }) }
  } finally { await stage.close() }
}

/** the frame used as the poster: script "poster" (seconds), else the first scene once it has settled */
export const posterTime = (timeline, at) => (Number.isFinite(at) ? at : Number.isFinite(timeline.poster) ? timeline.poster : settledTime(timeline.scenes[0], timeline.scenes.length === 1))

/** Web copy of a rendered video: a small faststart MP4, a poster JPEG drawn without captions, and the caption files.
    size is the length of the short side in pixels (720 gives 1280x720 or 720x1280). */
export async function exportWeb({ P, name, brand, timeline, opts, size = 720, crf = 27, dir, posterAt, log }) {
  const FF = findFF(), src = join(P, 'out', `${name}.mp4`)
  if (!existsSync(src)) throw new Error(`no rendered video for "${name}" (${src}). Render it first: reel video ${P} ${name}`)
  const outDir = dir || join(P, 'out', 'web'); mkdirSync(outDir, { recursive: true })
  const stage = await openStage({ P, brand, timeline, opts: { ...opts, captions: false }, log })
  let frame, wide
  try { wide = stage.size.W >= stage.size.H; frame = await grab(stage.pages[0], posterTime(timeline, posterAt)) } finally { await stage.close() }
  const scale = wide ? `scale=-2:${size}:flags=lanczos` : `scale=${size}:-2:flags=lanczos`
  const mp4 = join(outDir, `${name}.mp4`), jpg = join(outDir, `${name}.jpg`)
  await ffmpeg(FF, ['-i', src, '-vf', scale + ',setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', mp4])
  await ffmpeg(FF, ['-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-vf', scale, '-frames:v', '1', '-q:v', '4', '-update', '1', jpg], frame)
  const caps = writeCaptions({ P, name, timeline }), vtt = join(outDir, `${name}.vtt`)
  if (caps.vtt !== vtt) copyFileSync(caps.vtt, vtt)
  return { mp4, jpg, vtt }
}
