/* reel-studio layout maths. Pure functions with no canvas access, shared by the browser engine
   (loaded as a classic script before engine.js) and by the node tests (import './fit.js').
   Everything hangs off globalThis.ReelFit. */
'use strict'
;(function (g) {
  const even = (n) => 2 * Math.round(n / 2)
  const sum = (a) => a.reduce((x, y) => x + y, 0)

  /** Layout for a denser frame: the canvas gets `d` times fewer logical pixels while element sizes stay
      the same, so everything reads `d` times larger once the video is scaled down in a web page.
      The output keeps the base pixel size (outW x outH). */
  function densify(base, d) {
    if (!(d > 0) || d === 1) return { ...base, outW: base.W, outH: base.H }
    const W = even(base.W / d), H = even(base.H / d), y = (v) => Math.round(v / d), soft = Math.pow(d, 0.6)
    const left = Math.min(base.x0, 120) / d, right = Math.min(base.W - base.x1, 120) / d
    const cw = Math.round(Math.min(base.x1 - base.x0, W - left - right))
    const cx = (base.x0 + base.x1) / 2 / d
    const x0 = Math.round(Math.min(Math.max(left, cx - cw / 2), W - right - cw))
    return {
      ...base, W, H, outW: base.W, outH: base.H,
      tagY: y(base.tagY), headY: y(base.headY), bodyTop: y(base.bodyTop), bodyBottom: y(base.bodyBottom),
      capBase: y(base.capBase), progY: y(base.progY), capCx: y(base.capCx), capMaxW: Math.min(y(base.capMaxW), W - 80),
      capSize: Math.round(base.capSize / soft), titleSize: Math.round(base.titleSize / soft), x0, x1: x0 + cw,
    }
  }

  /** Rows of a list that must fit `avail` pixels of height.
      linesAt(k) returns the wrapped line count of every row when text is drawn at scale k.
      Full size first. If the list is too tall, rows are packed closer (down to `tight` per row) with the
      text kept at full size, and only then is everything scaled down, as far as minK.
      `fixedRow` keeps the old manual rowH. Returns { k, rows: [height per row], pad, total, fits }. */
  function fitRows({ linesAt, avail, row = 116, line = 48, rowPad = 20, pad = 60, tight = line * 1.5, minK = 0.5, fixedRow }) {
    if (fixedRow) {
      const n = linesAt(1).length, total = n * fixedRow + pad
      return { k: 1, rows: Array(n).fill(fixedRow), pad, total, fits: total <= avail + 0.5 }
    }
    const mixTo = (a, b, r) => a + (b - a) * r
    const at = (k, r) => {
      const rows = linesAt(k).map((n) => Math.max(mixTo(row, Math.min(row, tight), r) * k, n * line * k + mixTo(rowPad, rowPad * 0.6, r) * k))
      const p = mixTo(pad, pad * 0.6, r) * k, total = sum(rows) + p
      return { k, rows, pad: p, total, fits: total <= avail + 0.5 }
    }
    for (let r = 0; r <= 1.0001; r += 0.1) { const out = at(1, Math.min(1, r)); if (out.fits) return out }
    for (let k = 0.96; ; k -= 0.04) { const out = at(Math.max(minK, k), 1); if (out.fits || k <= minK) return out }
  }

  /** Largest font size (from `size` down to `min`) at which linesAt(size) has at most maxLines lines. */
  function fitText({ linesAt, size, min = 16, maxLines = 2 }) {
    for (let s = size; s > min; s -= 2) if (linesAt(s) <= maxLines) return s
    return min
  }

  /** Columns and rows for diagram nodes. Nodes may carry explicit col/row (0-based). Otherwise the column
      is the longest path from a source along the edges (back edges of a cycle are ignored) and the row is
      the order of declaration inside that column. direction 'down' swaps the two axes.
      Returns { cols, rows, at: { id: { col, row } }, back: Set of "from>to" edges that point backwards }. */
  function layoutDiagram(nodes, edges, direction = 'right') {
    const ids = nodes.map((n) => n.id), out = Object.fromEntries(ids.map((id) => [id, []]))
    for (const e of edges || []) if (out[e.from] && out[e.to] !== undefined && e.from !== e.to) out[e.from].push(e.to)
    const back = new Set(), state = {}, depth = Object.fromEntries(ids.map((id) => [id, 0]))
    const visit = (id) => { // depth-first: mark edges that close a cycle
      state[id] = 1
      for (const to of out[id]) { if (state[to] === 1) back.add(id + '>' + to); else if (!state[to]) visit(to) }
      state[id] = 2
    }
    ids.forEach((id) => { if (!state[id]) visit(id) })
    for (let pass = 0; pass < ids.length; pass++) { // longest path, forward edges only
      let moved = false
      for (const id of ids) for (const to of out[id]) if (!back.has(id + '>' + to) && depth[to] < depth[id] + 1) { depth[to] = depth[id] + 1; moved = true }
      if (!moved) break
    }
    const used = {}, at = {}
    for (const n of nodes) {
      const main = Number.isInteger(n.col) && direction !== 'down' ? n.col : Number.isInteger(n.row) && direction === 'down' ? n.row : depth[n.id]
      const explicitCross = direction === 'down' ? n.col : n.row
      let cross = Number.isInteger(explicitCross) ? explicitCross : (used[main] || 0)
      used[main] = Math.max(used[main] || 0, cross + 1)
      at[n.id] = direction === 'down' ? { col: cross, row: main } : { col: main, row: cross }
    }
    const cols = Math.max(1, ...Object.values(at).map((p) => p.col + 1)), rows = Math.max(1, ...Object.values(at).map((p) => p.row + 1))
    // centre short columns (or rows) against the longest one
    const span = direction === 'down' ? cols : rows
    for (const [main, count] of Object.entries(used)) {
      const shift = (span - count) / 2; if (!shift) continue
      for (const n of nodes) {
        const p = at[n.id], explicit = Number.isInteger(direction === 'down' ? n.col : n.row)
        if (explicit) continue
        if (direction === 'down' && p.row === +main) p.col += shift
        if (direction !== 'down' && p.col === +main) p.row += shift
      }
    }
    return { cols, rows, at, back }
  }

  /** Side lane for an edge that points backwards across the diagram, so it runs around the boxes instead of
      through them. direction 'right': 'top' or 'bottom'; direction 'down': 'left' or 'right'.
      A lane is usable when neither end has another node between it and that side. Returns null when the
      edge is short (neighbouring ranks) or no lane is clear. */
  function backLane(at, from, to, direction = 'right') {
    const a = at[from], b = at[to]; if (!a || !b) return null
    const main = direction === 'down' ? 'row' : 'col', cross = direction === 'down' ? 'col' : 'row'
    if (Math.abs(a[main] - b[main]) < 2) return null
    const others = (p, sign) => Object.values(at).some((q) => q !== p && q[main] === p[main] && (q[cross] - p[cross]) * sign > 0)
    const low = !others(a, -1) && !others(b, -1), high = !others(a, 1) && !others(b, 1)
    const names = direction === 'down' ? ['left', 'right'] : ['top', 'bottom']
    return low ? names[0] : high ? names[1] : null
  }

  /** Point where the segment from the centre of box a towards point (tx, ty) leaves the box (plus a gap). */
  function boxEdge(a, tx, ty, gap = 0) {
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2, dx = tx - cx, dy = ty - cy
    if (!dx && !dy) return { x: cx, y: cy }
    const k = Math.min(dx ? (a.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (a.h / 2 + gap) / Math.abs(dy) : Infinity)
    return { x: cx + dx * k, y: cy + dy * k }
  }

  /** A "nice" axis maximum at or above v (1, 2, 2.5, 5 x a power of ten). */
  function niceMax(v) {
    if (!(v > 0)) return 1
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
  }

  g.ReelFit = { even, densify, fitRows, fitText, layoutDiagram, backLane, boxEdge, niceMax }
})(globalThis)
