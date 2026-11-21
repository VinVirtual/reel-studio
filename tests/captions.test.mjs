// Caption files and the estimated timeline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stamp, cues, toVtt, toSrt } from '../engine/lib/captions.mjs'
import { estimateTimeline, captionGroups, syllables } from '../engine/lib/timeline.mjs'

const TL = { total: 9, scenes: [
  { start: 0.3, voice: 2.0, end: 2.8, chunks: [{ words: [{ w: 'Hello', t: 0.3 }, { w: 'there,', t: 0.7 }] }, { words: [{ w: 'world.', t: 1.4 }] }] },
  { start: 2.8, voice: 1.5, end: 9, chunks: [{ words: [{ w: 'Bye.', t: 2.8 }] }] },
] }

test('stamp formats hours, minutes, seconds and milliseconds', () => {
  assert.equal(stamp(0), '00:00:00.000'); assert.equal(stamp(3725.0416), '01:02:05.042'); assert.equal(stamp(1.5, ','), '00:00:01,500')
})

test('a cue ends when the next one starts, or soon after the voice stops', () => {
  const q = cues(TL)
  assert.deepEqual(q.map((c) => c.text), ['Hello there,', 'world.', 'Bye.'])
  assert.equal(q[0].end, 1.4); assert.equal(q[1].end, 2.65); assert.ok(q[2].end <= 9 && q[2].end > q[2].start)
  for (const c of q) assert.ok(c.end > c.start)
})

test('vtt and srt have the right framing', () => {
  const vtt = toVtt(TL), srt = toSrt(TL)
  assert.ok(vtt.startsWith('WEBVTT\n\n1\n00:00:00.300 --> 00:00:01.400\nHello there,\n'))
  assert.ok(srt.startsWith('1\n00:00:00,300 --> 00:00:01,400\nHello there,\n\n2\n'))
  assert.ok(!srt.includes('WEBVTT')); assert.equal(srt.split('\n\n').length, 3)
})

test('caption groups split at punctuation and avoid one-word orphans', () => {
  assert.deepEqual(captionGroups('One two three four five.'.split(' ')), [['One', 'two', 'three'], ['four', 'five.']])
  assert.deepEqual(captionGroups('Yes, we can do that now.'.split(' ')), [['Yes,', 'we', 'can', 'do'], ['that', 'now.']])
})

test('the estimated timeline has the shape the engine reads', () => {
  const tl = estimateTimeline({ scenes: [{ id: 'a', type: 'title', say: 'A short line.', keys: ['short'] }, { id: 'b', type: 'cta', say: 'The end.' }] })
  assert.equal(tl.scenes.length, 2); assert.equal(tl.scenes[0].start, 0.3)
  assert.ok(tl.scenes[0].end <= tl.scenes[1].start + 1e-9 && tl.total >= tl.scenes[1].end)
  assert.equal(tl.scenes[0].say, undefined)
  const words = tl.scenes[0].chunks.flatMap((c) => c.words)
  assert.deepEqual(words.map((w) => w.w), ['A', 'short', 'line.']); assert.equal(words[1].key, true)
  assert.ok(words[0].t < words[1].t && words[1].t < words[2].t)
  assert.equal(syllables('measure'), 2)
})
