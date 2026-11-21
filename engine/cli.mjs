#!/usr/bin/env node
// reel-studio command line. Run `reel help` (or `node cli.mjs help`) for the list of commands.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ENGINE, SKILL, findPython, findPlaywright, browserCandidates, launchBrowser, installHint, CPUS } from './lib/env.mjs'
import { projectDir, loadBrand, loadTimeline, listScripts, parseArgs, intFlag } from './lib/project.mjs'
import { renderStills, renderSheet, renderVideo, exportWeb, writeCaptions, defaultWorkers } from './lib/video.mjs'
import { lintProject } from './lib/lint.mjs'
import { formatIssues } from './lib/lintrules.mjs'
import { buildMany, summary } from './lib/build.mjs'

const HELP = `reel-studio: voiced motion-graphics videos from a script, made on this machine.

  reel check                               check the machine (Python, Kokoro, ffmpeg, Playwright, browser)
  reel new <dir>                           start a project (brand.json, script.json, custom.js, fonts/)
  reel lint <project> [script]             check a script before rendering   [--no-browser] [--strict] [--json]
  reel audio <project> [script]            voice, word timings, music and captions files
  reel sheet <project> [script]            one frame per scene in one PNG, to review the layout
  reel stills <project> [script] 1.5 4 9   single frames at those seconds
  reel video <project> [script]            out/<script>.mp4 (+ -voiceonly.mp4, .vtt, .srt)   [--web]
  reel web <project> [script]              out/web/<script>.mp4 (small, faststart), .jpg poster, .vtt
  reel captions <project> [script]         out/<script>.vtt and .srt only
  reel build <project> [scripts...]        audio + video for many scripts   [--jobs N] [--web] [--force]
  reel test                                run the self-tests

script defaults to "script" (<project>/script.json). build takes every script in the project when none is named.

options
  --no-captions        do not burn captions into the picture (the .vtt and .srt are still written)
  --workers N          browser pages drawing frames at once (default: up to 4, from the CPU count)
  --lossless           send frames as PNG instead of JPEG (slower, pixel exact)
  --quality 0.95       JPEG quality of the frames sent to the encoder
  --web-size 720       short side of the web copy in pixels      --web-crf 27    its quality (lower is better)
  --web-dir <dir>      where the web copy goes (default out/web)  --poster-at S   poster frame time in seconds
  --jobs N             build: scripts built at once (default 2)  --force         build: rebuild even if unchanged
`

// a reader that stops early (reel sheet ... | head -1) is not an error
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e })
const say = (m) => process.stdout.write(m + '\n')
const note = (m) => process.stderr.write(m + '\n')
const sh = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1

/** flags shared by the render commands -> options for the engine page */
const pageOpts = (flags) => (flags.captions === false ? { captions: false } : flags.captions === true ? { captions: true } : {})
const num = (flags, key) => (flags[key] === undefined ? undefined : Number(flags[key]))
function target(rest) {
  if (!rest[0]) throw new Error('which project? Give the project folder.')
  const P = projectDir(rest[0]), named = rest[1] !== undefined && !/^[\d.]+$/.test(rest[1])
  return { P, name: named ? rest[1].replace(/\.json$/, '') : 'script', extra: rest.slice(named ? 2 : 1) }
}
const webOptions = (flags) => ({ size: intFlag(flags, 'web-size', 720, 120, 4320), crf: intFlag(flags, 'web-crf', 27, 0, 51), dir: flags['web-dir'], posterAt: num(flags, 'poster-at') })

async function checkBrowser() {
  const { chromium, from } = findPlaywright(), cands = browserCandidates(chromium)
  say(`ok   playwright (${from})`)
  for (const c of cands) say(`${c.present ? 'ok  ' : 'none'} browser: ${c.label}`)
  const present = cands.filter((c) => c.present)
  const { browser, label } = await launchBrowser({ chromium, from, attempts: 2, log: note })
  await browser.close()
  say(`ok   browser starts: ${label}`)
  const own = cands.find((c) => c.label.startsWith("Playwright's own"))
  if (own && !own.present) say(`note Playwright's own Chromium is not installed, so there is no fallback if the browser above fails to start. To add it: ${installHint(from)}`)
  if (!present.length) throw new Error('no browser found')
}

const COMMANDS = {
  help: async () => say(HELP),
  check: async () => process.exit(sh('bash', [join(SKILL, 'check_env.sh')])),
  'check-browser': checkBrowser,
  new: async ({ rest }) => process.exit(sh('bash', [join(SKILL, 'new_project.sh'), ...rest])),
  test: async () => process.exit(sh(process.execPath, ['--test', ...readdirSync(join(SKILL, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => join(SKILL, 'tests', f))])),

  async lint({ rest, flags }) {
    const { P, name } = target(rest)
    const { issues, measured } = await lintProject({ P, name, browser: flags.browser !== false, opts: pageOpts(flags) })
    if (flags.json) say(JSON.stringify(issues, null, 1))
    else { say(formatIssues(issues)); if (!measured && flags.browser !== false) say('layout was not measured: no scene could be drawn') }
    if (issues.some((i) => i.level === 'error') || (flags.strict && issues.length)) process.exit(1)
  },
  async audio({ rest }) {
    const { P, name } = target(rest)
    const code = sh(findPython(), [join(ENGINE, 'gen_audio.py'), P, name]); if (code) process.exit(code)
    const c = writeCaptions({ P, name, timeline: loadTimeline(P, name) }); say(`${c.vtt}\n${c.srt}`)
  },
  async captions({ rest }) {
    const { P, name } = target(rest), c = writeCaptions({ P, name, timeline: loadTimeline(P, name) }); say(`${c.vtt}\n${c.srt}`)
  },
  async stills({ rest, flags }) {
    const { P, name, extra } = target(rest), times = extra.map(Number)
    if (!times.length || times.some((t) => !Number.isFinite(t))) throw new Error('stills needs one or more times in seconds, e.g. reel stills <project> script 1.5 4')
    for (const f of await renderStills({ P, name, brand: loadBrand(P), timeline: loadTimeline(P, name), opts: pageOpts(flags), times, log: note })) say(f)
  },
  async sheet({ rest, flags }) {
    const { P, name } = target(rest)
    const r = await renderSheet({ P, name, brand: loadBrand(P), timeline: loadTimeline(P, name), opts: pageOpts(flags), log: note })
    say(r.out); say('scenes: ' + r.legend)
  },
  async video({ rest, flags }) {
    const { P, name } = target(rest), brand = loadBrand(P), timeline = loadTimeline(P, name), opts = pageOpts(flags)
    const r = await renderVideo({ P, name, brand, timeline, opts, workers: intFlag(flags, 'workers', defaultWorkers(), 1, 16), lossless: !!flags.lossless, quality: num(flags, 'quality') ?? 0.95, log: note })
    say(`${r.out} (${timeline.total}s of video, ${r.size.W}x${r.size.H}, ${r.seconds.toFixed(0)}s to render with ${r.workers} page(s))`)
    say(`${r.vtt}\n${r.srt}`)
    if (flags.web) { const w = await exportWeb({ P, name, brand, timeline, opts, ...webOptions(flags), log: note }); say(`${w.mp4}\n${w.jpg}\n${w.vtt}`) }
  },
  async web({ rest, flags }) {
    const { P, name } = target(rest)
    const w = await exportWeb({ P, name, brand: loadBrand(P), timeline: loadTimeline(P, name), opts: pageOpts(flags), ...webOptions(flags), log: note })
    say(`${w.mp4}\n${w.jpg}\n${w.vtt}`)
  },
  async build({ rest, flags }) {
    if (!rest[0]) throw new Error('which project? Give the project folder.')
    const P = projectDir(rest[0]), all = listScripts(P), names = rest.length > 1 ? rest.slice(1).map((n) => n.replace(/\.json$/, '')) : all
    if (!names.length) throw new Error(`no scripts found in ${P}`)
    const jobs = intFlag(flags, 'jobs', 2, 1, 32)
    const options = { jobs, web: !!flags.web, force: !!flags.force, captions: flags.captions, lossless: !!flags.lossless, quality: num(flags, 'quality'),
      workers: intFlag(flags, 'workers', defaultWorkers(Math.min(jobs, names.length)), 1, 16), webSize: num(flags, 'web-size'), webCrf: num(flags, 'web-crf'), webDir: flags['web-dir'], posterAt: num(flags, 'poster-at') }
    say(`building ${names.length} script(s), ${Math.min(jobs, names.length)} at a time, ${options.workers} page(s) each (${CPUS} CPUs)`)
    const t0 = Date.now()
    const results = await buildMany(P, names, options, (r) => say(`${r.status.padEnd(7)} ${r.name}${r.status === 'built' ? `  ${r.steps.join('+')}  ${r.seconds.toFixed(0)}s` : r.status === 'failed' ? `  at the ${r.step} step` : ''}`))
    say(summary(results) + `  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
    if (results.some((r) => r.status === 'failed')) process.exit(1)
  },
}

const [command = 'help', ...argv] = process.argv.slice(2)
try {
  const run = COMMANDS[command.replace(/^--?/, '')]
  if (!run) throw new Error(`unknown command "${command}". Run "reel help".`)
  await run(parseArgs(argv))
} catch (e) {
  note('reel: ' + (e && e.message || e))
  process.exit(1)
}
