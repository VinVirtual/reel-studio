// --format: one script rendered in another shape without editing brand.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withFormat, parseArgs, FORMATS, checkFormatClash } from '../engine/lib/project.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FORMATS as LINT_FORMATS } from '../engine/lib/lintrules.mjs'
import { buildKeys, planSteps } from '../engine/lib/build.mjs'

test('without --format the brand and the file names are untouched', () => {
  const brand = { format: 'landscape', layout: { bodyTop: 320 } }, r = withFormat(brand, undefined)
  assert.equal(r.brand, brand); assert.equal(r.suffix, ''); assert.equal(r.droppedLayout, false)
})

test('--format swaps the shape and names the files after it', () => {
  const r = withFormat({ name: 'X', format: 'landscape', density: 1.2 }, 'square')
  assert.deepEqual(r.brand, { name: 'X', format: 'square', density: 1.2 }); assert.equal(r.suffix, '-square')
})

test('--format does not change the brand object it was given', () => {
  const brand = { format: 'vertical', layout: { bodyTop: 700 } }
  withFormat(brand, 'landscape')
  assert.deepEqual(brand, { format: 'vertical', layout: { bodyTop: 700 } })
})

test('a hand-set layout is dropped when the shape changes, and kept when it does not', () => {
  const brand = { format: 'vertical', layout: { bodyTop: 700 } }
  const other = withFormat(brand, 'landscape'), same = withFormat(brand, 'vertical')
  assert.equal(other.brand.layout, undefined); assert.equal(other.droppedLayout, true)
  assert.deepEqual(same.brand.layout, { bodyTop: 700 }); assert.equal(same.droppedLayout, false); assert.equal(same.suffix, '-vertical')
  assert.equal(withFormat({ layout: { bodyTop: 700 } }, 'vertical').droppedLayout, false, 'a brand without a format is vertical')
})

test('an unknown format is an error that lists the formats', () => {
  assert.throws(() => withFormat({}, 'wide'), /--format must be one of vertical, square, landscape, embed/)
  assert.deepEqual(FORMATS, LINT_FORMATS)
})

test('--format and --theme take a value on the command line', () => {
  assert.deepEqual(parseArgs(['p', '--format', 'square', '--web']), { flags: { format: 'square', web: true }, rest: ['p'] })
  assert.deepEqual(parseArgs(['d', '--theme=paper']).flags, { theme: 'paper' })
  assert.throws(() => parseArgs(['p', '--format']), /--format needs a value/)
})

test('a build with --format tracks its video and web copy apart from the default shape, and shares the voice', () => {
  assert.deepEqual(buildKeys('promo'), { outName: 'promo', video: 'video', web: 'web' })
  assert.deepEqual(buildKeys('promo', 'square'), { outName: 'promo-square', video: 'video@square', web: 'web@square' })
  const now = { audio: 'a', video: 'v', web: 'w' }, saved = { audio: 'a', video: 'v', web: 'w' }, have = { audio: true, video: false, web: false }
  assert.deepEqual(planSteps(now, saved, have, { web: true, format: 'square' }), { audio: false, video: true, web: true })
  const done = { ...saved, 'video@square': 'v', 'web@square': 'w' }
  assert.deepEqual(planSteps(now, done, { audio: true, video: true, web: true }, { web: true, format: 'square' }), { audio: false, video: false, web: false })
})

test('--format refuses a run whose files would share a name with another script', () => {
  const P = mkdtempSync(join(tmpdir(), 'reel-format-'))
  try {
    writeFileSync(join(P, 'promo.json'), '{}'); writeFileSync(join(P, 'promo-square.json'), '{}')
    assert.throws(() => checkFormatClash(P, 'promo', 'square'), /also the name of a script.*promo-square\.json/)
    assert.doesNotThrow(() => checkFormatClash(P, 'promo', 'vertical'))
    assert.doesNotThrow(() => checkFormatClash(P, 'promo-square', 'square'))
    assert.doesNotThrow(() => checkFormatClash(P, 'promo', undefined))
  } finally { rmSync(P, { recursive: true, force: true }) }
})
