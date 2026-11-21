// Lint rules: script checks and geometry checks on engine measurements.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintScript, lintGeometry, spokenMatch, atWords, overlapShare, formatIssues } from '../engine/lib/lintrules.mjs'

const scene = (extra) => ({ id: 's1', type: 'bullets', say: 'Send the date, guests and package.', items: ['One'], ...extra })
const lint = (sc, brand = {}, opts = {}) => lintScript({ scenes: [].concat(sc) }, brand, opts)
const rules = (issues, level) => issues.filter((i) => !level || i.level === level).map((i) => i.rule)

test('a clean scene has no issues', () => assert.deepEqual(lint(scene({ keys: ['date,'], items: [{ text: 'Date', at: 'date' }] })), []))

test('keys must be written exactly as spoken', () => {
  const out = lint(scene({ keys: ['date', 'ghost'] }))
  assert.deepEqual(rules(out, 'error'), ['keys', 'keys'])
  assert.match(out[0].message, /exactly as spoken: "date,"/)
})

test('at words must be spoken; matching ignores case and punctuation and allows a prefix', () => {
  assert.ok(spokenMatch('It confirms.', 'Confirm')); assert.ok(!spokenMatch('It confirms.', 'deny')); assert.ok(!spokenMatch('Hi.', '!!'))
  const out = lint(scene({ items: [{ text: 'A', at: 'guests' }, { text: 'B', at: 'venue' }], stamp: { label: 'NO', at: 'never' } }))
  assert.deepEqual(out.filter((i) => i.rule === 'at').map((i) => i.message.split(':')[0]), ['items[1].at', 'stamp.at'])
})

test('atWords finds every timed field', () => {
  const where = atWords({ items: [{ at: 'a' }], rows: [{ at: 'b' }], chips: ['x', { at: 'c' }], nodes: [{ at: 'd' }], edges: [{ at: 'e' }], bars: [{ at: 'f' }],
    left: { items: [{ at: 'g' }] }, right: { items: [{ at: 'h' }] }, badgeAt: 'i', buttonAt: 'j', loopAt: 'k', stamp: { at: 'l' }, status: { at: 'm' }, count: { at: 'n' }, typing: { at: 'o' } }).map((w) => w.word)
  assert.deepEqual(where.sort(), 'abcdefghijklmno'.split(''))
})

test('on-screen text over the word guide is a warning', () => {
  const out = lint([scene({ title: 'This headline has far too many words', items: ['One two three four five six'] }), { id: 'h', type: 'title', title: 'Six words are\nfine right here', say: 'Hi.' }])
  assert.deepEqual(rules(out), ['length', 'length']); assert.ok(out.every((i) => i.level === 'warn' && i.scene === 's1'))
})

test('unknown types are errors, unknown fields are warnings, custom scenes take any field', () => {
  assert.deepEqual(rules(lint(scene({ type: 'bulets' }))), ['type'])
  const out = lint(scene({ itmes: [] }))
  assert.deepEqual(out.map((i) => [i.level, i.rule]), [['warn', 'field']])
  assert.deepEqual(lint({ id: 'c', type: 'custom', fn: 'calendar', booked: [1], say: 'Hi.' }), [])
  assert.deepEqual(rules(lint({ id: 'c', type: 'custom', say: 'Hi.' })), ['value'])
})

test('ids, say and enums are checked', () => {
  const out = lint([scene({ id: 'a b' }), scene({ id: 'x' }), scene({ id: 'x', say: ' ' }), scene({ id: 'y', tone: 'angry', sfx: 'boom' })])
  assert.deepEqual(rules(out, 'error'), ['id', 'id', 'say', 'value', 'value'])
  assert.deepEqual(rules(lintScript({ scenes: [] })), ['script'])
})

test('missing files are errors, a bundled font is fine', () => {
  const have = new Set(['assets/ok.png'])
  const out = lintScript({ scenes: [{ id: 'i', type: 'image', src: 'assets/gone.png', say: 'Hi.' }, { id: 'j', type: 'image', src: 'assets/ok.png', say: 'Hi.' }, { id: 'k', type: 'custom', fn: 'f', say: 'Hi.' }] },
    { logo: 'assets/logo.png', fonts: { display: { file: 'fonts/Mine.ttf' }, body: { file: 'fonts/Geist.ttf' } } }, { exists: (p) => have.has(p), bundledFont: (f) => f.endsWith('Geist.ttf') })
  assert.deepEqual(out.filter((i) => i.rule === 'file').map((i) => i.message.split(':')[0]), ['logo not found', 'fonts.display', 'the script has custom scenes but the project has no custom.js', 'image not found'])
})

test('diagram, bars, steps and compare fields are checked', () => {
  const out = lint([
    { id: 'd', type: 'diagram', say: 'Hi.', nodes: [{ id: 'a' }, { id: 'a' }], edges: [{ from: 'a', to: 'zz' }] },
    { id: 'b', type: 'bars', say: 'Hi.', bars: [{ label: 'A', value: '12' }, { label: 'B', value: -1 }], direction: 'sideways' },
    { id: 's', type: 'steps', say: 'Hi.', direction: 'spiral' },
    { id: 'c', type: 'compare', say: 'Hi.', variant: 'odd', left: { items: [] }, right: { items: [] } },
  ])
  assert.deepEqual(out.map((i) => i.scene), ['d', 'd', 'b', 'b', 'b', 's', 's', 'c']); assert.ok(out.every((i) => i.level === 'error'))
})

test('brand values are checked', () => {
  const out = lintScript({ scenes: [scene()] }, { format: 'wide', background: 'stars', density: 5, colour: 1 })
  assert.deepEqual(out.map((i) => i.rule), ['field', 'value', 'value', 'value'])
})

const LAYOUT = { W: 1600, H: 900, x0: 300, x1: 1300, bodyTop: 250, bodyBottom: 690, capMaxW: 1180 }
const measured = (extra) => ({ id: 'm', type: 'bullets', capTop: 800, capWidest: 400, layout: LAYOUT, head: { ink: { x0: 500, y0: 60, x1: 1100, y1: 200 }, texts: [] },
  body: { ink: { x0: 300, y0: 260, x1: 1300, y1: 680 }, texts: [] }, ...extra })

test('a scene inside the body area passes', () => assert.deepEqual(lintGeometry(measured()), []))

test('content below or above the body area is an error', () => {
  const out = lintGeometry(measured({ body: { ink: { x0: 300, y0: 200, x1: 1300, y1: 760 }, texts: [] } }))
  assert.deepEqual(out.map((i) => [i.level, i.rule]), [['error', 'overflow'], ['error', 'overflow']])
  assert.match(out[0].message, /bottom of the body area by 70 px/)
})

test('title scenes may leave the body area but not reach the captions', () => {
  const ink = { x0: 200, y0: 100, x1: 1400, y1: 760 }
  assert.deepEqual(lintGeometry(measured({ type: 'title', head: {}, body: { ink, texts: [] } })), [])
  const out = lintGeometry(measured({ type: 'title', head: {}, body: { ink: { ...ink, y1: 830 }, texts: [] } }))
  assert.match(out[0].message, /caption area/)
  assert.deepEqual(lintGeometry(measured({ type: 'title', head: {}, capTop: null, body: { ink: { ...ink, y1: 830 }, texts: [] } })), [], 'captions off')
})

test('text that overlaps, is too wide or runs off the frame is reported', () => {
  const a = { s: 'Label', x0: 340, y0: 300, x1: 700, y1: 340 }, b = { s: 'Value', x0: 500, y0: 305, x1: 1260, y1: 338 }
  assert.ok(overlapShare(a, b) > 0.25); assert.equal(overlapShare(a, { ...b, x0: 800 }), 0)
  const out = lintGeometry(measured({ body: { ink: { x0: 300, y0: 260, x1: 1300, y1: 680 }, texts: [a, b, { s: 'Wide', x0: 250, y0: 500, x1: 1350, y1: 540 }, { s: 'Gone', x0: 1500, y0: 600, x1: 1700, y1: 640 }] } }))
  assert.deepEqual(out.map((i) => i.message.split(':')[0]), ['text is wider than the content area', 'text runs off the frame', 'text overlaps'])
})

test('a headline that runs into the body, a failed draw and a wide caption are reported', () => {
  const out = lintGeometry(measured({ capWidest: 1300, head: { ink: { x0: 500, y0: 60, x1: 1100, y1: 300 }, texts: [] }, body: { error: 'boom', ink: { x0: 300, y0: 260, x1: 1300, y1: 680 }, texts: [] } }))
  assert.deepEqual(out.map((i) => i.rule), ['draw', 'overflow', 'text'])
})

test('formatIssues lists every issue and counts them', () => {
  assert.equal(formatIssues([]), 'no problems found')
  const text = formatIssues(lint(scene({ keys: ['nope'], title: 'One two three four five six' })))
  assert.match(text, /^error  s1 {5}keys:/m); assert.match(text, /1 error\(s\), 1 warning\(s\)$/)
})
