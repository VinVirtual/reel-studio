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

  /** relative luminance (0 black .. 1 white) of a #rrggbb or #rgb colour, as WCAG defines it */
  function luminance(hex) {
    let h = String(hex).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&')
    const [r, gr, b] = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * gr + 0.0722 * b
  }
  /** WCAG contrast ratio of two colours, 1 (the same) to 21 (black on white) */
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  /* ---------- code scenes ---------- */
  const HASH_LANGS = new Set(['', 'sh', 'bash', 'shell', 'zsh', 'python', 'py', 'yaml', 'yml', 'toml', 'ruby', 'rb', 'dockerfile', 'make', 'r', 'perl'])
  const DASH_LANGS = new Set(['sql', 'lua', 'haskell'])
  const PLAIN_LANGS = new Set(['text', 'plain', 'txt', 'none'])
  const KEYWORDS = new Set(('const let var function return if else for while do break continue switch case default import from export class extends new this ' +
    'async await try catch finally throw typeof instanceof in of def elif lambda pass with as yield not and or is fn pub use mod struct impl trait enum match mut ' +
    'type interface package func go defer select where insert into values update set delete create table then fi done echo ' +
    'true false null undefined None True False nil void int string bool float').split(' '))

  /** One line of code as coloured pieces: [{ t, k }], k = text | comment | string | number | keyword | punct.
      A small tokeniser, not a parser: line comments (// everywhere, # and -- by language), quoted strings,
      numbers and common keywords. lang "text" switches the colouring off. Joining every t gives the line back. */
  function codeTokens(line, lang = '') {
    const src = String(line), l = String(lang || '').toLowerCase(), out = []
    if (PLAIN_LANGS.has(l)) return src ? [{ t: src, k: 'text' }] : []
    const push = (t, k) => { const last = out[out.length - 1]; if (last && last.k === k) last.t += t; else out.push({ t, k }) }
    let i = 0
    while (i < src.length) {
      const ch = src[i], rest = src.slice(i)
      // "//" after a colon is a URL, and "#" counts only at the start of a word in languages that use it
      const comment = rest.startsWith('//') ? src[i - 1] !== ':' && !HASH_LANGS.has(l || '-')
        : ch === '#' ? HASH_LANGS.has(l) && (i === 0 || /\s/.test(src[i - 1])) : rest.startsWith('--') && DASH_LANGS.has(l)
      if (comment) { push(rest, 'comment'); break }
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1
        while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1
        push(src.slice(i, Math.min(src.length, j + 1)), 'string'); i = Math.min(src.length, j + 1); continue
      }
      const word = /^[A-Za-z_$][\w$]*/.exec(rest)
      if (word) { push(word[0], KEYWORDS.has(word[0]) ? 'keyword' : 'text'); i += word[0].length; continue }
      const number = /^\d[\d_]*(\.\d+)?/.exec(rest)
      if (number) { push(number[0], 'number'); i += number[0].length; continue }
      if (/\s/.test(ch)) { push(ch, out.length ? out[out.length - 1].k : 'text'); i++; continue }
      push(ch, 'punct'); i++
    }
    return out
  }

  /** The lines of a code scene as [{ text, at, tone, cmd }]. Takes `lines` (strings or { text, at, tone } objects)
      or one `code` string. In the terminal variant a line that starts with the prompt is a command (cmd: true). */
  function codeLines(s) {
    const raw = Array.isArray(s.lines) ? s.lines : typeof s.code === 'string' ? s.code.replace(/\n$/, '').split('\n') : []
    const prompt = (s.prompt ?? '$') + ' '
    return raw.map((l) => {
      const o = typeof l === 'string' ? { text: l } : { ...l }, text = String(o.text ?? '').replace(/\t/g, '  ')
      return { ...o, text, cmd: s.variant === 'terminal' && text.startsWith(prompt) }
    })
  }

  /** `highlight` of a code scene as { lines: [0-based indexes], at }. Accepts 3, [2, 3] or { line | lines, at } (1-based). */
  function codeHighlight(h, n) {
    if (h === undefined || h === null || h === false) return { lines: [], at: null }
    const o = typeof h === 'object' && !Array.isArray(h) ? h : { lines: h }
    const list = [].concat(o.lines ?? o.line ?? []).map(Number).filter((v) => Number.isInteger(v) && v >= 1 && v <= n).map((v) => v - 1)
    return { lines: [...new Set(list)], at: o.at || null }
  }

  /** Font size for a block of code: the largest size (from `size` down to `min`) at which `cols` characters fit
      `width` and `rows` lines fit `height`. charW is the width of one character as a share of the font size. */
  function fitCode({ cols, rows, width, height, size = 32, min = 14, charW = 0.6, lineH = 1.5 }) {
    const best = Math.min(size, width / (Math.max(1, cols) * charW), height / (Math.max(1, rows) * lineH))
    return { size: Math.max(min, Math.floor(best * 2) / 2), fits: best >= min }
  }

  /** How many of `len` characters are on screen at time t for a line that starts typing at t0, at `cps`
      characters a second, and is complete by `until` at the latest (but never types in under 0.12 s). */
  function typedChars(len, t, t0, cps = 40, until = Infinity) {
    if (!(len > 0) || t <= t0) return 0
    const d = Math.max(0.12, Math.min(len / cps, until - t0))
    return Math.min(len, Math.floor((t - t0) / d * len + 1e-6))
  }

  g.ReelFit = { even, densify, fitRows, fitText, layoutDiagram, backLane, boxEdge, niceMax, luminance, contrast, codeTokens, codeLines, codeHighlight, fitCode, typedChars }
})(globalThis)
