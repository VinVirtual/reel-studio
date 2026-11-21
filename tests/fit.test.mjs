// Layout maths: density, row fitting, diagram layout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../engine/fit.js'

const { densify, fitRows, fitText, layoutDiagram, backLane, boxEdge } = globalThis.ReelFit
const LANDSCAPE = { W: 1920, H: 1080, tagY: 90, headY: 180, bodyTop: 300, bodyBottom: 820, capBase: 1000, capMaxW: 1400, capSize: 52, capCx: 960, progY: 40, x0: 460, x1: 1460, titleSize: 76 }
const VERTICAL = { W: 1080, H: 1920, tagY: 330, headY: 470, bodyTop: 640, bodyBottom: 1250, capBase: 1420, capMaxW: 820, capSize: 58, capCx: 520, progY: 236, x0: 120, x1: 940, titleSize: 88 }

test('densify keeps the output size and shrinks the layout canvas', () => {
  const d = densify(LANDSCAPE, 1.2)
  assert.deepEqual([d.W, d.H, d.outW, d.outH], [1600, 900, 1920, 1080])
  assert.equal(d.x1 - d.x0, 1000, 'content width is kept when it still fits')
  assert.ok(d.bodyTop < LANDSCAPE.bodyTop && d.bodyBottom < d.capBase && d.capBase < d.H)
  assert.ok(d.titleSize < LANDSCAPE.titleSize && d.titleSize > LANDSCAPE.titleSize / 1.2, 'type shrinks less than the canvas')
})

test('densify of 1 changes nothing but adds the output size', () => {
  assert.deepEqual(densify(LANDSCAPE, 1), { ...LANDSCAPE, outW: 1920, outH: 1080 })
})

test('densify keeps the vertical safe margins', () => {
  const d = densify(VERTICAL, 1.25)
  assert.ok(d.x0 >= 120 / 1.25 - 1 && d.x1 <= d.W - 120 / 1.25 + 1)
  assert.equal(d.W % 2, 0); assert.equal(d.H % 2, 0)
})

test('fitRows leaves a short list at full size', () => {
  const f = fitRows({ avail: 520, linesAt: () => [1, 1, 1] })
  assert.equal(f.k, 1); assert.deepEqual(f.rows, [116, 116, 116]); assert.equal(f.total, 408); assert.ok(f.fits)
})

test('fitRows packs rows closer before it shrinks the text', () => {
  const f = fitRows({ avail: 440, linesAt: () => [1, 1, 1, 1, 1] }) // five rows need 640 at full size
  assert.equal(f.k, 1, 'text stays full size'); assert.ok(f.fits); assert.ok(f.rows[0] < 116 && f.rows[0] >= 72)
})

test('fitRows shrinks the text only when packing is not enough, and never below minK', () => {
  const f = fitRows({ avail: 440, linesAt: () => Array(7).fill(1) })
  assert.ok(f.fits && f.k < 1 && f.k >= 0.5); assert.ok(f.total <= 440.5)
  const hopeless = fitRows({ avail: 100, linesAt: () => Array(12).fill(2) })
  assert.equal(hopeless.fits, false); assert.equal(hopeless.k, 0.5)
})

test('fitRows gives wrapped rows more height', () => {
  const f = fitRows({ avail: 2000, linesAt: () => [1, 3] })
  assert.equal(f.rows[0], 116); assert.equal(f.rows[1], 3 * 48 + 20)
})

test('fitRows with a manual row height does not fit anything', () => {
  const f = fitRows({ avail: 300, fixedRow: 92, linesAt: () => [1, 1, 1, 1] })
  assert.deepEqual(f.rows, [92, 92, 92, 92]); assert.equal(f.k, 1); assert.equal(f.fits, false)
})

test('fitText returns the largest size that fits the line limit', () => {
  assert.equal(fitText({ size: 36, min: 20, maxLines: 2, linesAt: (z) => (z > 30 ? 3 : 2) }), 30)
  assert.equal(fitText({ size: 36, min: 20, maxLines: 2, linesAt: () => 9 }), 20)
})

test('layoutDiagram ranks nodes by the longest path and centres short columns', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const g = layoutDiagram(nodes, [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }], 'right')
  assert.equal(g.cols, 3); assert.equal(g.rows, 2)
  assert.deepEqual(g.at.a, { col: 0, row: 0 }); assert.deepEqual(g.at.b, { col: 0, row: 1 })
  assert.deepEqual(g.at.c, { col: 1, row: 0.5 }); assert.deepEqual(g.at.d, { col: 2, row: 0.5 })
})

test('layoutDiagram survives a cycle and marks the edge that closes it', () => {
  const nodes = ['a', 'b', 'c'].map((id) => ({ id }))
  const g = layoutDiagram(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }], 'right')
  assert.equal(g.cols, 3); assert.ok(g.back.has('c>a')); assert.equal(g.back.size, 1)
  assert.equal(backLane(g.at, 'c', 'a', 'right'), 'top')
  assert.equal(backLane(g.at, 'b', 'a', 'right'), null, 'neighbours get a plain line')
})

test('layoutDiagram direction down swaps the axes and honours manual places', () => {
  const g = layoutDiagram([{ id: 'a' }, { id: 'b' }, { id: 'x', row: 0, col: 1 }], [{ from: 'a', to: 'b' }, { from: 'ghost', to: 'b' }], 'down')
  assert.deepEqual(g.at.a, { col: 0, row: 0 }); assert.deepEqual(g.at.x, { col: 1, row: 0 }); assert.equal(g.at.b.row, 1)
})

test('boxEdge leaves the box on the side that faces the target', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 }
  assert.deepEqual(boxEdge(box, 500, 25), { x: 100, y: 25 })
  assert.deepEqual(boxEdge(box, 50, -400, 10), { x: 50, y: -10 })
})
