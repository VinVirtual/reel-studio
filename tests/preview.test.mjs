// The preview command: the timeline it shows, and the files its local server may hand out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sep } from 'node:path'
import { freshTimeline, safeJoin } from '../engine/lib/preview.mjs'

const word = (w, t, key = false) => ({ w, t, key })
const timeline = () => ({ total: 6, fps: 30, scenes: [
  { id: 'a', type: 'title', title: 'Old title', start: 0.3, voice: 1.2, end: 2, chunks: [{ words: [word('Hello', 0.3), word('there.', 0.7, true)] }] },
  { id: 'b', type: 'bullets', items: ['One'], start: 2, voice: 2, end: 6, chunks: [{ words: [word('Second', 2), word('line.', 2.5)] }] },
] })
const script = (a = {}, b = {}) => ({ scenes: [{ id: 'a', type: 'title', title: 'Old title', say: 'Hello there.', keys: ['there.'], ...a }, { id: 'b', type: 'bullets', items: ['One'], say: 'Second line.', ...b }] })

test('a visual edit shows without making the voice again, and the timing is kept', () => {
  const { timeline: out, stale } = freshTimeline(timeline(), script({ title: 'New title', tone: 'fix' }, { items: ['One', 'Two'] }))
  assert.deepEqual(stale, [])
  assert.equal(out.scenes[0].title, 'New title'); assert.equal(out.scenes[0].tone, 'fix'); assert.deepEqual(out.scenes[1].items, ['One', 'Two'])
  assert.deepEqual([out.scenes[0].start, out.scenes[0].voice, out.scenes[0].end], [0.3, 1.2, 2])
  assert.equal(out.scenes[0].say, undefined); assert.equal(out.total, 6)
})

test('caption highlights follow the keys in the script', () => {
  const { timeline: out } = freshTimeline(timeline(), script({ keys: ['Hello'] }))
  assert.deepEqual(out.scenes[0].chunks[0].words.map((w) => w.key), [true, false])
})

test('the timeline it was given is not changed', () => {
  const before = timeline(), copy = JSON.parse(JSON.stringify(before))
  freshTimeline(before, script({ title: 'New', keys: [] }))
  assert.deepEqual(before, copy)
})

test('a changed line, a new scene and a removed scene are reported as needing the voice again', () => {
  assert.match(freshTimeline(timeline(), script({ say: 'Hello  there, friend.' })).stale[0], /^a: the spoken line changed/)
  assert.deepEqual(freshTimeline(timeline(), script({ say: 'Hello   there.' })).stale, [], 'spacing alone is not a change')
  const more = script(); more.scenes.push({ id: 'c', type: 'title', say: 'More.' })
  assert.match(freshTimeline(timeline(), more).stale[0], /^c: new scene/)
  const fewer = { scenes: script().scenes.slice(0, 1) }, r = freshTimeline(timeline(), fewer)
  assert.match(r.stale[0], /^b: no longer in the script/); assert.equal(r.timeline.scenes.length, 2, 'it still plays what was voiced')
  const swapped = { scenes: script().scenes.reverse() }
  assert.deepEqual(freshTimeline(timeline(), swapped).stale, ['the scenes changed order'])
})

test('the server only hands out files inside the project', () => {
  assert.equal(safeJoin('/p/proj', 'assets/a.png'), `${sep}p${sep}proj${sep}assets${sep}a.png`)
  assert.equal(safeJoin('/p/proj', '/custom.js'), `${sep}p${sep}proj${sep}custom.js`)
  assert.equal(safeJoin('/p/proj', '../other/secret'), null)
  assert.equal(safeJoin('/p/proj', 'a/../../proj-two/x'), null)
  assert.equal(safeJoin('/p/proj', '..'), null)
})
