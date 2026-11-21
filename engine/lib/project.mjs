// Reading a project folder: brand.json, scripts, timelines, fonts. Also the command-line flag parser.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SKILL } from './env.mjs'

/** read a JSON file, with the file name in the error when it is missing or broken */
export function readJson(path, what = 'file') {
  if (!existsSync(path)) throw new Error(`${what} not found: ${path}`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (e) { throw new Error(`${what} is not valid JSON: ${path}\n  ${e.message}`) }
}

export const projectDir = (arg) => {
  const P = resolve(arg)
  if (!existsSync(join(P, 'brand.json'))) throw new Error(`not a reel-studio project (no brand.json): ${P}`)
  return P
}
export const loadBrand = (P) => readJson(join(P, 'brand.json'), 'brand.json')
export const loadScript = (P, name) => readJson(join(P, `${name}.json`), `script "${name}"`)
export function loadTimeline(P, name) {
  const path = join(P, 'build', `${name}.timeline.json`)
  if (!existsSync(path)) throw new Error(`no timeline for "${name}" (${path}). Make the voice first: reel audio ${P} ${name}`)
  return readJson(path, 'timeline')
}

/** every script in a project: the .json files in its root that hold a "scenes" list (or cannot be read as JSON) */
export function listScripts(P) {
  return readdirSync(P).filter((f) => f.endsWith('.json') && f !== 'brand.json' && f !== 'package.json').sort()
    .filter((f) => { try { return Array.isArray(JSON.parse(readFileSync(join(P, f), 'utf8')).scenes) } catch { return true } }) // a file that is not valid JSON stays in, so the build reports it
    .map((f) => f.slice(0, -5))
}

/** the project's font file if present, else the bundled font with the same file name, else null */
export function fontPath(P, font) {
  if (!font || !font.file) return null
  for (const p of [join(P, font.file), join(SKILL, 'assets', 'fonts', basename(font.file))]) if (existsSync(p)) return p
  return null
}

/** the object window.setup() takes in the page */
export function setupArgs(P, brand, timeline, opts = {}, warn = () => {}) {
  const font = (f) => {
    const path = fontPath(P, f)
    if (f && f.file && !path) warn(`font not found, using a system font: ${f.file}`)
    return { ...(f || {}), url: path ? pathToFileURL(path).href : undefined }
  }
  const custom = existsSync(join(P, 'custom.js')) ? pathToFileURL(join(P, 'custom.js')).href : null
  return { timeline, brand, base: pathToFileURL(P + '/').href, fonts: { display: font(brand.fonts?.display), body: font(brand.fonts?.body) }, custom, opts }
}

const VALUE_FLAGS = new Set(['jobs', 'workers', 'quality', 'poster-at', 'web-size', 'web-crf', 'web-dir'])
/** "--jobs 3 --web a b" -> { flags: { jobs: '3', web: true }, rest: ['a', 'b'] }. "--no-x" sets x to false. */
export function parseArgs(argv) {
  const flags = {}, rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { rest.push(a); continue }
    const [key, inline] = a.slice(2).split(/=(.*)/s)
    if (key.startsWith('no-')) flags[key.slice(3)] = false
    else if (VALUE_FLAGS.has(key)) {
      const v = inline ?? argv[++i]
      if (v === undefined) throw new Error(`--${key} needs a value`)
      flags[key] = v
    } else flags[key] = inline ?? true
  }
  return { flags, rest }
}

/** a whole number flag within [min, max], or the default */
export function intFlag(flags, key, fallback, min = 1, max = 64) {
  if (flags[key] === undefined) return fallback
  const n = Number(flags[key])
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${key} must be a whole number from ${min} to ${max}`)
  return n
}
