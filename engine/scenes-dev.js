/* reel-studio scene types for developer and explainer videos: code (an editor or terminal panel whose lines
   type on) and timeline (milestones along a line). Loaded after scenes-explain.js, whose helpers it uses.
   The parts that need no canvas (tokeniser, typing, fitting) live in fit.js and are unit tested. */
'use strict'

Object.assign(TYPES, {
  /** a code or terminal panel. fields: lines[text | {text, at, tone}] or code ("a\nb"), file, lang,
      variant: editor | terminal, mode: type | lines, highlight: 2 | [2, 3] | {line | lines, at}, numbers, prompt, size.
      Each line starts at its `at` word (or in turn). The text shrinks until the longest line and all the rows fit. */
  code(t, s) {
    const lines = ReelFit.codeLines(s), n = lines.length; if (!n) return
    const term = s.variant === 'terminal', numbers = !term && s.numbers !== false, typing = (s.mode || 'type') === 'type'
    const x = L.x0, w = L.x1 - L.x0, avail = L.bodyBottom - L.bodyTop, bar = 60, padX = 34, padY = 24, b = ST.border
    const digits = String(n).length, gutter = numbers ? digits + 2 : 0
    ctx.font = font({ mono: true, size: 100 }); const charW = ctx.measureText('M').width / 100
    const cols = Math.max(...lines.map((l) => l.text.length)) + gutter
    const F = ReelFit.fitCode({ cols, rows: n, width: w - padX * 2, height: avail - bar - padY * 2, size: s.size || 38, charW })
    const size = F.size, cw = size * charW, lh = size * 1.5, h = bar + padY * 2 + n * lh, y0 = L.bodyTop + Math.max(0, (avail - h) / 2)
    const c = toneColour(s.tone), prompt = (s.prompt ?? '$') + ' '
    const INK = { text: C.text, comment: C.mute, string: C.goodHi, number: C.accent2, keyword: C.accent, punct: C.soft, prompt: C.accent, out: C.soft }
    const TONE = { fix: C.goodHi, problem: C.badHi, mute: C.mute }

    panel(x, y0, w, h, { r: 28 })
    rr(x + b, y0 + b, w - b * 2, bar - b, [28 - b, 28 - b, 0, 0]); ctx.fillStyle = C.panel2; ctx.fill()
    ;[C.bad, C.accent, C.good].forEach((dot, i) => { ctx.beginPath(); ctx.arc(x + 38 + i * 27, y0 + bar / 2 + b / 2, 8, 0, Math.PI * 2); ctx.fillStyle = rgba(dot, 0.85); ctx.fill() })
    const label = s.file || (term ? 'terminal' : s.lang || '')
    if (label) text(label, x + w / 2, y0 + bar / 2 + b / 2 + 1, { mono: true, size: 22, color: 'soft', align: 'center', base: 'middle' })

    const T = lines.map((l, i) => revealAt(s, l, i, n))
    const HL = ReelFit.codeHighlight(s.highlight, n), hk = HL.lines.length ? outCubic(prog(t, HL.at ? wt(s, HL.at) : Math.max(...T) + 0.7, 0.35)) : 0
    let cursor = null
    lines.forEach((l, i) => {
      const y = y0 + bar + padY + (i + 0.5) * lh, hit = HL.lines.includes(i)
      if (hit && hk > 0) {
        ctx.save(); ctx.globalAlpha *= hk
        rr(x + b + 8, y - lh / 2, w - b * 2 - 16, lh, 8); ctx.fillStyle = rgba(c, 0.17); ctx.fill()
        ctx.fillStyle = c; ctx.fillRect(x + b + 8, y - lh / 2, 5, lh); ctx.restore()
      }
      if (numbers) text(String(i + 1), x + padX + digits * cw, y + 1, { mono: true, size, color: hit && hk > 0.5 ? c : rgba(C.mute, 0.75), align: 'right', base: 'middle' })
      if (t < T[i]) return
      // a command types after its prompt; program output and "lines" mode arrive whole
      const typed = typing && (!term || l.cmd), lead = term && l.cmd ? prompt.length : 0
      const shown = typed ? lead + ReelFit.typedChars(l.text.length - lead, t, T[i], 40, (T[i + 1] ?? Infinity) - 0.06) : l.text.length
      const toks = term ? (l.cmd ? [{ t: prompt, k: 'prompt' }, { t: l.text.slice(prompt.length), k: 'text' }] : [{ t: l.text, k: 'out' }]) : ReelFit.codeTokens(l.text, s.lang)
      ctx.save(); ctx.globalAlpha *= (typed ? 1 : outCubic(prog(t, T[i], 0.25))) * (HL.lines.length && !hit ? lerp(1, 0.45, hk) : 1)
      let cx = x + padX + gutter * cw, left = shown
      for (const tk of toks) {
        if (left <= 0) break
        const str = tk.t.slice(0, left); left -= str.length
        cx += text(str, cx, y + 1, { mono: true, size, base: 'middle', weight: tk.k === 'keyword' ? 700 : 500, color: TONE[l.tone] || INK[tk.k] })
      }
      ctx.restore()
      cursor = { x: cx, y, busy: shown < l.text.length }
    })
    // block cursor after the newest line: solid while it types, blinking once it rests
    if (cursor && typing && hk < 0.5 && (cursor.busy || Math.floor(t * 2.4) % 2 === 0)) { ctx.fillStyle = C.accent; ctx.fillRect(cursor.x + 3, cursor.y - size * 0.56, size * 0.52, size * 1.1) }
  },

  /** milestones along a line. fields: items[{date, text, note, at, tone}], direction: row | column.
      The line and every label are on screen from the start, dimmed; the line runs to each milestone as its word is spoken. */
  timeline(t, s) {
    const items = (s.items || []).map((it) => (typeof it === 'string' ? { text: it } : it)), n = items.length; if (!n) return
    const w = L.x1 - L.x0, avail = L.bodyBottom - L.bodyTop
    const T = items.map((it, i) => revealAt(s, it, i, n)), lit = T.map((ti) => outCubic(prog(t, ti, 0.35)))
    const pop = (i) => outCubic(prog(t, s.start + 0.1 + i * 0.07, 0.4))
    const cOf = (it) => toneColour(it.tone || s.tone)
    // how far the lit line has run: from one milestone to the next as each lights up
    let run = 0
    for (let i = 1; i < n; i++) run += io(prog(t, T[i] - 0.38, 0.38))
    const dot = (cx, cy, i, r) => {
      const c = cOf(items[i]), k = lit[i], pulse = 1 - prog(t, T[i], 0.9)
      if (k > 0 && pulse > 0) { ctx.beginPath(); ctx.arc(cx, cy, r + 16 * (1 - pulse), 0, Math.PI * 2); ctx.strokeStyle = rgba(c, 0.5 * pulse * k); ctx.lineWidth = 3; ctx.stroke() }
      ctx.beginPath(); ctx.arc(cx, cy, r * lerp(0.8, 1, outBack(k, 2)), 0, Math.PI * 2); ctx.fillStyle = mix(C.bg, c, k); ctx.fill()
      ctx.lineWidth = 4; ctx.strokeStyle = mix(C.mute, c, k); ctx.stroke()
    }
    const row = (s.direction || (W >= H * 0.9 && n <= 5 ? 'row' : 'column')) === 'row'
    if (row) {
      const colW = w / n, tw = colW - 18, hasDate = items.some((it) => it.date), hasNote = items.some((it) => it.note)
      const dateSize = ReelFit.fitText({ size: 34, min: 18, maxLines: 1, linesAt: (z) => Math.max(...items.map((it) => (it.date ? linesWithin(String(it.date), tw, { size: z, weight: 700 }) : 1))) })
      const size = ReelFit.fitText({ size: 32, min: 18, maxLines: 3, linesAt: (z) => Math.max(...items.map((it) => linesWithin(it.text || '', tw, { size: z, weight: 600 }))) })
      const most = Math.max(...items.map((it) => wrapLines(it.text || '', tw, { size, weight: 600 }).length)), noteSize = Math.min(22, size * 0.72)
      const above = hasDate ? dateSize + 34 : 0, below = 44 + most * size * 1.2 + (hasNote ? noteSize * 2.6 : 0)
      const k0 = Math.min(1, avail / (above + below)), lineY = L.bodyTop + (avail - (above + below) * k0) / 2 + above * k0
      const xa = L.x0 + colW / 2, xb = L.x1 - colW / 2
      ctx.lineCap = 'round'; ctx.lineWidth = 5
      ctx.strokeStyle = rgba(C.text, 0.16); ctx.beginPath(); ctx.moveTo(L.x0 + 10, lineY); ctx.lineTo(L.x1 - 10, lineY); ctx.stroke()
      if (lit[0] > 0) { ctx.strokeStyle = toneColour(s.tone); ctx.beginPath(); ctx.moveTo(lerp(xa, L.x0 + 10, lit[0]), lineY); ctx.lineTo(n > 1 ? xa + (xb - xa) * run / (n - 1) : xa, lineY); ctx.stroke() }
      items.forEach((it, i) => {
        const cx = L.x0 + (i + 0.5) * colW, k = pop(i); if (k <= 0) return
        ctx.save(); ctx.globalAlpha *= k
        if (it.date) text(String(it.date), cx, lineY - 34 * k0, { size: dateSize * k0, weight: 700, align: 'center', color: mix(C.mute, cOf(it), lit[i]) })
        dot(cx, lineY, i, 13)
        const lines = wrapLines(it.text || '', tw, { size, weight: 600 }), ty = lineY + 44 * k0 + size * k0 * 0.5
        lines.forEach((l, j) => text(l, cx, ty + j * size * 1.2 * k0, { size: size * k0, weight: 600, align: 'center', base: 'middle', color: mix(C.mute, C.text, lit[i]) }))
        if (it.note) centred(it.note, cx, ty + lines.length * size * 1.2 * k0 + noteSize * 0.7 * k0, tw, { size: noteSize * k0, color: mix(C.mute, C.soft, lit[i]) })
        ctx.restore()
      })
      return
    }
    // column: the line runs down the left, one row per milestone
    const tx = 92
    const F = ReelFit.fitRows({ avail, row: 108, line: 48, rowPad: 40, tight: 88, pad: 0, linesAt: (k) => items.map((it) => wrapLines(it.text || '', w - tx * k, { size: 40 * k, weight: 600 }).length + (it.date ? 0.8 : 0) + (it.note ? 0.75 : 0)) })
    const k0 = F.k, y0 = L.bodyTop + (avail - F.total) / 2, lx = L.x0 + 30 * k0
    let top = y0; const ys = []
    const rows = items.map((it, i) => { const r = { y: top, h: F.rows[i] }; top += F.rows[i]; ys.push(r.y + r.h / 2); return r })
    ctx.lineCap = 'round'; ctx.lineWidth = 5
    ctx.strokeStyle = rgba(C.text, 0.16); ctx.beginPath(); ctx.moveTo(lx, y0 + 6); ctx.lineTo(lx, y0 + F.total - 6); ctx.stroke()
    if (lit[0] > 0) {
      const seg = Math.min(n - 1, Math.floor(run)), end = n > 1 ? lerp(ys[seg], ys[Math.min(n - 1, seg + 1)], run - seg) : ys[0]
      ctx.strokeStyle = toneColour(s.tone); ctx.beginPath(); ctx.moveTo(lx, lerp(ys[0], y0 + 6, lit[0])); ctx.lineTo(lx, end); ctx.stroke()
    }
    items.forEach((it, i) => {
      const k = pop(i); if (k <= 0) return
      const { y, h } = rows[i], lines = wrapLines(it.text || '', w - tx * k0, { size: 40 * k0, weight: 600 })
      const block = (it.date ? 38 * k0 : 0) + lines.length * 48 * k0 + (it.note ? 36 * k0 : 0)
      let ty = y + h / 2 - block / 2
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 24, 0)
      dot(lx, y + h / 2, i, 15 * k0)
      if (it.date) { text(String(it.date), L.x0 + tx * k0, ty + 19 * k0, { size: 29 * k0, weight: 700, base: 'middle', color: mix(C.mute, cOf(it), lit[i]) }); ty += 38 * k0 }
      lines.forEach((l, j) => text(l, L.x0 + tx * k0, ty + (j + 0.5) * 48 * k0, { size: 40 * k0, weight: 600, base: 'middle', color: mix(C.mute, C.text, lit[i]) }))
      if (it.note) text(it.note, L.x0 + tx * k0, ty + lines.length * 48 * k0 + 18 * k0, { size: 26 * k0, base: 'middle', color: mix(C.mute, C.soft, lit[i]) })
      ctx.restore()
    })
  },
})
