// Batch build planning, flag parsing and browser launch retries (no browser or ffmpeg needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSteps, summary } from '../engine/lib/build.mjs'
import { parseArgs, intFlag } from '../engine/lib/project.mjs'
import { launchBrowser } from '../engine/lib/env.mjs'

const now = { audio: 'a1', video: 'v1', web: 'w1' }, all = { audio: true, video: true, web: true }

test('nothing is rebuilt when fingerprints and files match', () => {
  assert.deepEqual(planSteps(now, { ...now }, all, { web: true }), { audio: false, video: false, web: false })
})

test('a changed script rebuilds everything after it', () => {
  assert.deepEqual(planSteps(now, { ...now, audio: 'old' }, all, { web: true }), { audio: true, video: true, web: true })
  assert.deepEqual(planSteps(now, { ...now, video: 'old' }, all, { web: true }), { audio: false, video: true, web: true })
  assert.deepEqual(planSteps(now, { ...now, web: 'old' }, all, { web: true }), { audio: false, video: false, web: true })
})

test('missing outputs and --force rebuild; web is skipped unless asked for', () => {
  assert.deepEqual(planSteps(now, { ...now }, { ...all, video: false }), { audio: false, video: true, web: false })
  assert.deepEqual(planSteps(now, { ...now }, all, { force: true }), { audio: true, video: true, web: false })
  assert.deepEqual(planSteps(now, {}, { audio: false, video: false, web: false }, { web: true }), { audio: true, video: true, web: true })
})

test('the summary names what failed', () => {
  const text = summary([{ name: 'a', status: 'built' }, { name: 'b', status: 'skipped' }, { name: 'c', status: 'failed', step: 'video', tail: 'boom', logPath: '/x/c.log' }])
  assert.match(text, /^1 built, 1 unchanged, 1 failed/); assert.match(text, /FAILED c \(video step\) {2}log: \/x\/c.log\n {4}boom/)
})

test('parseArgs separates flags from names', () => {
  const { flags, rest } = parseArgs(['proj', '--jobs', '3', 'a', '--web', '--no-captions', '--web-crf=30', 'b'])
  assert.deepEqual(rest, ['proj', 'a', 'b']); assert.deepEqual(flags, { jobs: '3', web: true, captions: false, 'web-crf': '30' })
  assert.equal(intFlag(flags, 'jobs', 2), 3); assert.equal(intFlag(flags, 'workers', 4), 4)
  assert.throws(() => intFlag({ jobs: 'many' }, 'jobs', 2), /whole number/); assert.throws(() => parseArgs(['--jobs']), /needs a value/)
})

const fakeChromium = (plan) => { const calls = []; return { calls, launch: async (o) => { calls.push(o); const r = plan(calls.length, o); if (r instanceof Error) throw r; return r } } }
const noWait = async () => {}

test('a launch that fails once is retried on the same browser', async () => {
  const chromium = fakeChromium((n) => (n === 1 ? new Error('Target closed') : { ok: true }))
  const r = await launchBrowser({ chromium, wait: noWait, candidates: [{ label: 'chrome', options: { channel: 'chrome' }, present: true }] })
  assert.equal(chromium.calls.length, 2); assert.equal(r.label, 'chrome'); assert.equal(r.tried.length, 1)
})

test('the next browser is used when the first keeps failing; missing ones are skipped without a launch', async () => {
  const chromium = fakeChromium((n, o) => (o.channel ? new Error('crashed') : { ok: true }))
  const r = await launchBrowser({ chromium, wait: noWait, attempts: 2, candidates: [
    { label: 'gone', options: { executablePath: '/nope' }, present: false }, { label: 'chrome', options: { channel: 'chrome' }, present: true }, { label: 'system', options: { executablePath: '/usr/bin/x' }, present: true }] })
  assert.equal(r.label, 'system'); assert.equal(chromium.calls.length, 3)
})

test('when nothing starts, the error lists what was tried and how to fix it', async () => {
  const chromium = fakeChromium(() => new Error("browserType.launch: Executable doesn't exist at /cache/chromium_headless_shell\nmore"))
  await assert.rejects(launchBrowser({ chromium, from: 'playwright-core', wait: noWait, attempts: 2, candidates: [{ label: 'chrome', options: {}, present: true }, { label: 'bundled', options: {}, present: false }] }), (e) => {
    assert.match(e.message, /No browser could be started/); assert.match(e.message, /chrome: attempt 2 failed: browserType.launch: Executable doesn't exist/)
    assert.match(e.message, /bundled: not installed/); assert.match(e.message, /install chromium/); assert.match(e.message, /REEL_CHROME/)
    return true
  })
})
