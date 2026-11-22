// Tool lookups must not run code planted in the folder the command is started from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pythonProbe, findPlaywright } from '../engine/lib/env.mjs'

/** a temp folder holding Python modules that leave a marker file when imported, made the current folder */
function plantedFolder(t) {
  const dir = mkdtempSync(join(tmpdir(), 'planted-')), was = process.cwd(), marker = join(dir, 'RAN')
  for (const name of ['json', 'numpy', 'imageio_ffmpeg', 'kokoro_onnx', 'soundfile']) {
    writeFileSync(join(dir, name + '.py'), `open(${JSON.stringify(marker)}, "w").write("${name}")\nraise SystemExit(0)\n`)
  }
  process.chdir(dir)
  t.after(() => { process.chdir(was); rmSync(dir, { recursive: true, force: true }) })
  return { dir, marker }
}

test('Python probes never import modules planted in the current folder', (t) => {
  const { dir, marker } = plantedFolder(t)
  let out = ''
  try { out = pythonProbe('import json;print(json.__file__)') } catch (e) { assert.fail(`python probe failed: ${e.message}`) }
  assert.ok(!out.startsWith(dir), `json came from the planted folder: ${out}`)
  for (const code of ['import imageio_ffmpeg', 'import numpy', 'import kokoro_onnx, soundfile, numpy']) {
    try { pythonProbe(code) } catch { /* the real package may be missing; that is fine */ }
  }
  assert.equal(existsSync(marker), false, 'a planted module ran')
})

test('Playwright is never loaded from the current working folder', (t) => {
  const { dir } = plantedFolder(t)
  const mod = join(dir, 'node_modules', 'playwright-core')
  mkdirSync(mod, { recursive: true })
  writeFileSync(join(mod, 'package.json'), '{"name":"playwright-core","main":"index.js"}')
  writeFileSync(join(mod, 'index.js'), "module.exports = { chromium: 'planted' }")
  writeFileSync(join(dir, '.npmrc'), `prefix=${dir}\n`)
  let found = null
  try { found = findPlaywright() } catch (e) { assert.match(e.message, /Playwright not found/) }
  if (found) { assert.notEqual(found.chromium, 'planted'); assert.ok(!found.from.startsWith(dir), found.from) }
})
