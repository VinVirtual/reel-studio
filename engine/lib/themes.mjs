// Themes (ready-made brand files in themes/) and the `new` command that starts a project from one.
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { SKILL } from './env.mjs'
import { readJson, MONO_FONT, FORMATS } from './project.mjs'

export const THEMES_DIR = join(SKILL, 'themes')

/** every bundled theme: [{ name, about, brand }], in name order */
export function listThemes(dir = THEMES_DIR) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const brand = readJson(join(dir, f), 'theme')
    return { name: f.slice(0, -5), about: brand.about || '', brand }
  })
}

/** the brand.json of a theme, without the "about" line */
export function themeBrand(name, dir = THEMES_DIR) {
  const all = listThemes(dir), hit = all.find((t) => t.name === name)
  if (!hit) throw new Error(`no theme called "${name}". Themes: ${all.map((t) => t.name).join(', ')}`)
  const { about, ...brand } = hit.brand
  return brand
}

/** one line per theme for `reel themes` */
export function describeThemes(themes) {
  const w = Math.max(...themes.map((t) => t.name.length))
  return themes.map((t) => {
    const f = t.brand.fonts || {}, light = t.brand.colors?.bg && parseInt(t.brand.colors.bg.slice(1, 3), 16) > 128
    return `${t.name.padEnd(w)}  ${t.about}\n${''.padEnd(w)}  ${light ? 'light' : 'dark'} · ${f.display?.family || 'system font'} + ${f.body?.family || 'system font'} · background ${t.brand.background || 'glow-dots'} · captions ${t.brand.style?.captions || 'outline'}`
  }).join('\n')
}

/** brand.json text in the layout of the bundled files: one top-level key per line */
export function brandText(brand) {
  const lines = Object.entries(brand).map(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && ['colors', 'fonts', 'style'].includes(k)) return ` ${JSON.stringify(k)}: {\n${Object.entries(v).map(([kk, vv]) => `  ${JSON.stringify(kk)}: ${JSON.stringify(vv)}`).join(',\n')}\n }`
    return ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`
  })
  return `{\n${lines.join(',\n')}\n}\n`
}

/** Start a project in `dir`: brand.json (from a theme when one is named), script.json, custom.js and the fonts
    the brand uses. Files that already exist are kept. Returns { dir, made: [files written], theme }. */
export function newProject(dir, { theme, format } = {}) {
  if (!dir) throw new Error('which folder? reel new <dir> [--theme <name>] [--format vertical|square|landscape|embed]')
  if (format !== undefined && !FORMATS.includes(format)) throw new Error(`--format must be one of ${FORMATS.join(', ')}`)
  const made = [], templates = join(SKILL, 'templates')
  mkdirSync(join(dir, 'fonts'), { recursive: true }); mkdirSync(join(dir, 'assets'), { recursive: true })
  const brandPath = join(dir, 'brand.json')
  if (!existsSync(brandPath)) {
    if (theme || format) { const brand = theme ? themeBrand(theme) : readJson(join(templates, 'brand.json'), 'brand template'); writeFileSync(brandPath, brandText(format ? { ...brand, format } : brand)) }
    else copyFileSync(join(templates, 'brand.json'), brandPath)
    made.push('brand.json')
  } else if (theme) throw new Error(`${brandPath} already exists, so the theme was not applied. Remove it first, or copy ${join(THEMES_DIR, theme + '.json')} over it.`)
  for (const f of ['script.json', 'custom.js']) if (!existsSync(join(dir, f))) { copyFileSync(join(templates, f), join(dir, f)); made.push(f) }
  const brand = readJson(brandPath, 'brand.json'), fonts = [brand.fonts?.display, brand.fonts?.body, brand.fonts?.mono || MONO_FONT].filter((f) => f && f.file).map((f) => basename(f.file))
  for (const f of new Set([...fonts, 'OFL.txt'])) {
    const src = join(SKILL, 'assets', 'fonts', f), dst = join(dir, 'fonts', f)
    if (existsSync(src) && !existsSync(dst)) { copyFileSync(src, dst); made.push('fonts/' + f) }
  }
  return { dir, made, theme: brand.theme || null }
}
