// Word timing: the Python helpers (model patch and word alignment) have their own self-test, run here when
// a Python 3 is on the machine. It needs no packages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ENGINE } from '../engine/lib/env.mjs'

const python = ['python3', 'python'].find((p) => spawnSync(p, ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'], { cwd: ENGINE }).status === 0)

test('word_timing.py: exposing the duration output and lining words up with phonemes', { skip: python ? false : 'no python3 on this machine' }, () => {
  const r = spawnSync(python, [join(ENGINE, 'word_timing.py'), '--selftest'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /selftest ok/)
})
