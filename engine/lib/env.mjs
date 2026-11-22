// Where reel-studio finds its tools: Python + Kokoro, ffmpeg, Playwright and a browser.
// Every location has a default and an environment variable that overrides it (see README.md).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir, cpus } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SKILL = resolve(ENGINE, '..')
export const KOKORO_HOME = process.env.KOKORO_HOME || join(homedir(), 'kokoro')
export const CPUS = Math.max(1, cpus().length)

// Helpers run from the skill's own folder, never the current one: npm reads a .npmrc there and Python imports from it.
const run = (cmd, args) => execFileSync(cmd, args, { cwd: SKILL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const onPath = (name) => { try { return run(process.platform === 'win32' ? 'where' : 'which', [name]).split('\n')[0] } catch { return null } }

/** Python that can import kokoro_onnx: $REEL_PYTHON, else the venv in $KOKORO_HOME, else python3 on PATH. */
export function findPython() {
  if (process.env.REEL_PYTHON) return process.env.REEL_PYTHON
  for (const p of [join(KOKORO_HOME, '.venv', 'bin', 'python'), join(KOKORO_HOME, '.venv', 'Scripts', 'python.exe')]) if (existsSync(p)) return p
  return onPath('python3') || onPath('python') || 'python3'
}

/** Runs a one-line Python probe and returns what it prints. -I keeps the current folder, PYTHONPATH and the user's
    site-packages off the import path, so a planted numpy.py or imageio_ffmpeg.py there cannot run. */
export function pythonProbe(code, py = findPython()) {
  return execFileSync(py, ['-I', '-c', code], { cwd: SKILL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** ffmpeg: $FF, else ffmpeg on PATH, else the binary that the imageio-ffmpeg Python package ships. */
export function findFF() {
  if (process.env.FF) return process.env.FF
  const sys = onPath('ffmpeg'); if (sys) return sys
  try { return pythonProbe('import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())') } catch {}
  throw new Error('ffmpeg not found. Install ffmpeg, or run `pip install imageio-ffmpeg` in the Kokoro venv, or set FF=/path/to/ffmpeg')
}

/** Playwright's chromium launcher and the folder it was loaded from: $PLAYWRIGHT_CORE, else what node finds from
    the skill's own folder, else the global npm folder. Never the current working folder, so a project folder cannot
    supply code that runs here. */
export function findPlaywright() {
  const require = createRequire(import.meta.url)
  let root = ''; try { root = run('npm', ['root', '-g']) } catch {}
  const cands = [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright',
    root && join(root, 'playwright-core'), root && join(root, 'playwright'), root && join(root, '@playwright/cli/node_modules/playwright-core'), root && join(root, '@playwright/test/node_modules/playwright-core')].filter(Boolean)
  for (const c of cands) { try { return { chromium: require(c).chromium, from: c } } catch {} }
  throw new Error('Playwright not found. Run `npm i -g playwright-core`, or set PLAYWRIGHT_CORE=/path/to/playwright-core')
}

/** command that installs Playwright's own Chromium for the copy of Playwright in use */
export function installHint(from) {
  const cli = from && from.includes('/') && existsSync(join(from, 'cli.js')) ? `node ${join(from, 'cli.js')}` : 'npx playwright'
  return `${cli} install chromium`
}

const SYSTEM_BROWSERS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']
const APP_BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']

/** Browsers to try, best first. Each is { label, options, present } where present says the binary exists. */
export function browserCandidates(chromium, env = process.env) {
  const list = []
  if (env.REEL_CHROME) list.push({ label: `REEL_CHROME (${env.REEL_CHROME})`, options: { executablePath: env.REEL_CHROME }, present: existsSync(env.REEL_CHROME) })
  const paths = [...SYSTEM_BROWSERS.map(onPath), ...APP_BROWSERS].filter((p) => p && existsSync(p))
  list.push({ label: 'installed Chrome (Playwright channel "chrome")', options: { channel: 'chrome' }, present: paths.some((p) => /chrome/i.test(p)) })
  for (const p of paths) list.push({ label: p, options: { executablePath: p }, present: true })
  let bundled = ''; try { bundled = chromium.executablePath() } catch {}
  // Playwright keeps its browsers in one folder; headless runs may use chromium_headless_shell instead of chromium
  const registry = bundled ? resolve(bundled, '..', '..', '..') : ''
  let installed = false; try { installed = readdirSync(registry).some((d) => d.startsWith('chromium')) } catch {}
  list.push({ label: `Playwright's own Chromium${registry ? ` (in ${registry})` : ''}`, options: {}, present: installed })
  return list
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const firstLine = (e) => String(e && e.message || e).split('\n')[0].slice(0, 200)

/** Launch a browser, trying every candidate that exists up to `attempts` times with a growing pause.
    A launch can fail for a moment when several renders start together, so one failure is never final.
    Throws one error that lists what was tried and how to fix it. */
export async function launchBrowser({ chromium, from, attempts = 3, timeout = 60000, log = () => {}, candidates, wait = sleep } = {}) {
  if (!chromium) ({ chromium, from } = findPlaywright())
  const cands = candidates || browserCandidates(chromium), tried = []
  for (const c of cands) {
    if (!c.present) { tried.push(`${c.label}: not installed`); continue }
    for (let i = 1; i <= attempts; i++) {
      try {
        const browser = await chromium.launch({ ...c.options, timeout, args: ['--allow-file-access-from-files'] })
        const failed = tried.filter((t) => t.includes('failed')).length
        if (failed) log(`browser: using ${c.label} after ${failed} failed attempt(s)`)
        return { browser, label: c.label, tried }
      } catch (e) {
        tried.push(`${c.label}: attempt ${i} failed: ${firstLine(e)}`)
        if (i < attempts) await wait(600 * i * i)
      }
    }
  }
  throw new Error(['No browser could be started. Tried:', ...tried.map((t) => '  - ' + t), 'Fix one of these:',
    '  - install Google Chrome or Chromium', `  - install Playwright's own Chromium: ${installHint(from)}`, '  - set REEL_CHROME=/path/to/chrome'].join('\n'))
}
