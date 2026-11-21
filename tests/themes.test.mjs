// Themes: every bundled theme is a valid, readable brand, and `reel new --theme` starts a project from one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { listThemes, themeBrand, describeThemes, brandText, newProject } from '../engine/lib/themes.mjs'
import { lintScript, lintStyle, lintContrast, BRAND_FIELDS, BACKGROUNDS } from '../engine/lib/lintrules.mjs'
import { brandContrast, contrast, luminance, resolveColors } from '../engine/lib/contrast.mjs'
import { SKILL } from '../engine/lib/env.mjs'

const themes = listThemes()
const template = JSON.parse(readFileSync(join(SKILL, 'templates', 'script.json'), 'utf8'))
const inTemp = (fn) => { const dir = mkdtempSync(join(tmpdir(), 'reel-test-')); try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) } }

test('there are at least five themes and each says what it is', () => {
  assert.ok(themes.length >= 5)
  for (const t of themes) { assert.equal(t.brand.theme, t.name); assert.ok(t.about.length > 20, t.name) }
})

test('the themes differ in more than colour: fonts, backgrounds and caption styles vary', () => {
  const count = (pick) => new Set(themes.map(pick)).size
  assert.ok(count((t) => t.brand.fonts.display.family) >= 5)
  assert.ok(count((t) => t.brand.background) >= 4)
  assert.ok(count((t) => t.brand.style?.captions || 'outline') >= 3)
  assert.ok(count((t) => t.brand.style?.motion || 'smooth') >= 3)
  assert.ok(themes.some((t) => luminance(t.brand.colors.bg) > 0.5) && themes.some((t) => luminance(t.brand.colors.bg) < 0.05), 'light and dark themes')
})

for (const t of themes) {
  test(`theme ${t.name}: known fields, a valid style and bundled fonts`, () => {
    for (const k of Object.keys(t.brand)) assert.ok(BRAND_FIELDS.includes(k), `field ${k}`)
    assert.deepEqual(lintStyle(t.brand), [])
    assert.ok(BACKGROUNDS.includes(t.brand.background))
    for (const f of Object.values(t.brand.fonts)) assert.ok(existsSync(join(SKILL, 'assets', 'fonts', basename(f.file))), f.file)
  })
  test(`theme ${t.name}: text is readable on every surface it is drawn on`, () => {
    const pairs = brandContrast(t.brand)
    assert.ok(pairs.length >= 14)
    for (const p of pairs) assert.ok(p.ratio >= p.min, `${p.what}: ${p.fg} on ${p.bg} is ${p.ratio.toFixed(2)}, needs ${p.min}`)
    assert.deepEqual(lintContrast(t.brand), [])
  })
  test(`theme ${t.name}: the template script lints clean with it`, () => {
    assert.deepEqual(lintScript(template, themeBrand(t.name), { exists: (f) => f === 'custom.js', bundledFont: () => true }), [])
  })
}

test('contrast maths: black on white is 21, a colour on itself is 1', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21); assert.equal(contrast('#abc', '#aabbcc'), 1)
  assert.ok(luminance('#ffffff') > 0.99 && luminance('#000') === 0)
})

test('lint warns about a brand whose text is hard to read, and not about the default colours', () => {
  assert.deepEqual(lintContrast({}), [])
  const out = lintContrast({ colors: { bg: '#ffffff', text: '#dddddd' } })
  assert.ok(out.length >= 1); assert.ok(out.every((i) => i.level === 'warn' && i.rule === 'contrast')); assert.match(out[0].message, /text on the background/)
})

test('caption colours follow the caption style', () => {
  assert.equal(resolveColors({}).capStroke, '#0A0806')
  const box = resolveColors({ colors: { bg: '#ffffff', text: '#111111' }, style: { captions: 'box' } })
  assert.equal(box.capText, '#ffffff'); assert.equal(box.capBg, '#111111')
  assert.equal(resolveColors({ colors: { bg: '#ffffff', text: '#111111' } }).capStroke, '#ffffff', 'a light brand gets a light outline')
})

test('brand.style is checked: bad values are errors, unknown keys are warnings', () => {
  assert.deepEqual(lintStyle({}), [])
  assert.deepEqual(lintStyle({ style: { corners: 0, shadow: 'hard', border: 5, borderColor: 'text', glow: false, motion: 'snappy', transition: 'cut', captions: 'box', captionCase: 'upper', captionFont: 'display', titleCase: 'upper' } }), [])
  const out = lintStyle({ style: { corners: 5, shadow: 'huge', glow: 'yes', wobble: 1 } })
  assert.deepEqual(out.map((i) => i.level), ['error', 'error', 'error', 'warn'])
  assert.equal(lintStyle({ style: 'bold' })[0].level, 'error')
})

test('an unknown theme names the ones that exist', () => assert.throws(() => themeBrand('nope'), /no theme called "nope".*ember/))

test('describeThemes gives two lines per theme', () => {
  const text = describeThemes(themes)
  assert.equal(text.split('\n').length, themes.length * 2)
  for (const t of themes) assert.ok(text.includes(t.name))
})

test('brandText writes JSON that reads back the same', () => {
  for (const t of themes) assert.deepEqual(JSON.parse(brandText(t.brand)), t.brand)
})

test('new --theme writes that theme as brand.json with the fonts it uses', () => inTemp((tmp) => {
  const dir = join(tmp, 'p'), r = newProject(dir, { theme: 'paper', format: 'square' })
  const brand = JSON.parse(readFileSync(join(dir, 'brand.json'), 'utf8'))
  assert.equal(brand.theme, 'paper'); assert.equal(brand.format, 'square'); assert.equal(brand.about, undefined)
  assert.deepEqual(brand.colors, themeBrand('paper').colors)
  for (const f of ['script.json', 'custom.js', 'fonts/InstrumentSerif-Regular.ttf', 'fonts/Geist.ttf', 'fonts/JetBrainsMono.ttf', 'fonts/OFL.txt']) assert.ok(existsSync(join(dir, f)), f)
  assert.ok(!existsSync(join(dir, 'fonts', 'Anton-Regular.ttf')), 'only the fonts the brand uses')
  assert.ok(r.made.includes('brand.json'))
}))

test('new without a theme copies the template, and keeps files that are already there', () => inTemp((tmp) => {
  const dir = join(tmp, 'p')
  newProject(dir)
  assert.equal(readFileSync(join(dir, 'brand.json'), 'utf8'), readFileSync(join(SKILL, 'templates', 'brand.json'), 'utf8'))
  writeFileSync(join(dir, 'script.json'), '{"scenes": []}')
  assert.deepEqual(newProject(dir).made, [])
  assert.equal(readFileSync(join(dir, 'script.json'), 'utf8'), '{"scenes": []}')
  assert.throws(() => newProject(dir, { theme: 'paper' }), /already exists/)
  assert.throws(() => newProject(dir, { format: 'square' }), /already exists, so --format was not applied/)
  assert.throws(() => newProject(join(tmp, 'q'), { format: 'wide' }), /--format must be one of/)
  assert.throws(() => newProject(), /which folder/)
}))
