/* reel-studio scene types for explainers: steps (a numbered flow), diagram (boxes and arrows) and bars
   (a bar chart that grows). Loaded after scenes.js. The structure is on screen from the start of the scene,
   dimmed, and each part lights up when its word is spoken, so a viewer always sees where the part belongs. */
'use strict'

/** a polyline drawn up to fraction k of its length, with an arrowhead at the tip */
function pathArrow(points, k, o = {}) {
  k = clamp(k); if (k <= 0 || points.length < 2) return
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]))
  let left = segs.reduce((a, b) => a + b, 0) * k, tip = points[0], dir = 0
  ctx.save(); ctx.strokeStyle = ctx.fillStyle = col(o.color || 'accent'); ctx.lineWidth = o.width || 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (o.dashed) ctx.setLineDash([12, 12])
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1])
  for (let i = 0; i < segs.length && left > 0; i++) {
    const u = Math.min(1, left / (segs[i] || 1)), a = points[i], b = points[i + 1]
    tip = [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; dir = Math.atan2(b[1] - a[1], b[0] - a[0]); ctx.lineTo(tip[0], tip[1]); left -= segs[i]
  }
  ctx.stroke(); ctx.setLineDash([])
  const h = o.head ?? 14
  if (h) { ctx.beginPath(); ctx.moveTo(tip[0] + Math.cos(dir) * h * 0.6, tip[1] + Math.sin(dir) * h * 0.6); ctx.lineTo(tip[0] + Math.cos(dir + 2.5) * h, tip[1] + Math.sin(dir + 2.5) * h); ctx.lineTo(tip[0] + Math.cos(dir - 2.5) * h, tip[1] + Math.sin(dir - 2.5) * h); ctx.closePath(); ctx.fill() }
  ctx.restore()
}
/** text wrapped and centred on (cx, cy) */
function centred(str, cx, cy, maxW, o) {
  const lines = wrapLines(str, maxW, o), lh = o.lh || o.size * 1.18
  lines.forEach((l, i) => text(l, cx, cy + (i - (lines.length - 1) / 2) * lh, { ...o, align: 'center', base: 'middle' }))
}
/** wrapped line count, or 99 when a single word is wider than maxW (so callers shrink the text further) */
function linesWithin(str, maxW, o) {
  const lines = wrapLines(str, maxW, o); ctx.font = font(o)
  return lines.some((l) => ctx.measureText(l).width > maxW) ? 99 : lines.length
}
/** a small label on a patch of background colour, centred on (x, y) */
function edgeLabel(label, x, y, alpha, align = 'center') {
  ctx.save(); ctx.globalAlpha *= clamp(alpha); ctx.font = font({ size: 22, weight: 600 }); const tw = ctx.measureText(label).width
  const left = align === 'left' ? x : x - tw / 2
  rr(left - 9, y - 17, tw + 18, 34, 10); ctx.fillStyle = C.bg; ctx.fill()
  text(label, left, y + 1, { size: 22, weight: 600, base: 'middle', color: 'soft' }); ctx.restore()
}
const toneColour = (name) => (name === 'fix' ? C.good : name === 'problem' ? C.bad : name === 'mute' ? C.mute : C.accent)
const mix = (a, b, k) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(lerp(v, y[i], clamp(k))).toString(16).padStart(2, '0')).join('') }
/** the box of one step or node: dim until lit (0..1), glowing while it is the current one (glow 0..1) */
function flowBox(x, y, w, h, lit, glow, c, r = 26) {
  const b = ST.border ? ST.border + 1 : 0
  ctx.save()
  if (glow > 0.01 && ST.glow && ST.shadow !== 'hard') { ctx.shadowColor = rgba(c, 0.55 * glow); ctx.shadowBlur = 44 }
  else dropShadow(x, y, w, h, r, { color: 'rgba(0,0,0,0.45)', blur: 36, dy: 16, hard: 8 })
  rr(x, y, w, h, r); ctx.fillStyle = mix(C.panel, C.panel2, lit); ctx.fill()
  ctx.restore()
  if (!b) return
  rr(x + b / 2, y + b / 2, w - b, h - b, r - 1); ctx.lineWidth = b; ctx.strokeStyle = lit > 0 ? rgba(c, lerp(0.22, 0.9, lit)) : ST.borderColor ? rgba(col(ST.borderColor), 0.35) : rgba(C.text, 0.12); ctx.stroke()
}
function numberBadge(cx, cy, r, n, lit, c) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = lit > 0 ? rgba(c, lerp(0.16, 1, lit)) : rgba(C.text, 0.08); ctx.fill()
  text(String(n), cx, cy + 1, { size: r * 1.05, weight: 700, align: 'center', base: 'middle', color: mix(C.mute, C.onAccent, lit) })
}

Object.assign(TYPES, {
  /** numbered flow with arrows; each step lights when its word is spoken.
      fields: items[{text, at, note}], direction: row | column, loop (arrow from the last step back to the first), loopAt */
  steps(t, s) {
    const items = s.items || [], n = items.length; if (!n) return
    const w = L.x1 - L.x0, avail = L.bodyBottom - L.bodyTop, c = toneColour(s.tone)
    const T = items.map((it, i) => revealAt(s, it, i, n)), lit = T.map((ti) => outCubic(prog(t, ti, 0.35)))
    // the newest lit step glows; the glow moves on when the next one lights
    const glow = lit.map((k, i) => k * (1 - (i < n - 1 ? lit[i + 1] : 0)) * (0.75 + 0.25 * Math.sin((t - T[i]) * 3)))
    const pop = (i) => outBack(prog(t, s.start + 0.12 + i * 0.07, 0.4), 1.4)
    const loopK = s.loop ? io(prog(t, s.loopAt ? wt(s, s.loopAt) : T[n - 1] + 0.3, 0.5)) : 0
    const row = (s.direction || (W >= H * 0.9 && n <= 5 ? 'row' : 'column')) === 'row'
    if (row) {
      const gap = n > 4 ? 44 : 64, bw = (w - (n - 1) * gap) / n, loopH = s.loop ? 62 : 0, hasNote = items.some((it) => it.note)
      const bh = Math.min(avail - loopH, hasNote ? 250 : 210), y0 = L.bodyTop + (avail - bh - loopH) / 2, br = Math.min(30, bw * 0.13)
      const size = ReelFit.fitText({ size: 36, min: 20, maxLines: 2, linesAt: (z) => Math.max(...items.map((it) => linesWithin(itemText(it), bw - 28, { size: z, weight: 600 }))) })
      items.forEach((it, i) => {
        const x = L.x0 + i * (bw + gap), k = pop(i); if (k <= 0) return
        if (i < n - 1) { // arrow to the next step: dim track, then the lit arrow runs along it
          const ax0 = x + bw + 12, ax1 = x + bw + gap - 12, ay = y0 + bh / 2
          ctx.save(); ctx.globalAlpha *= clamp(k); arrow(ax0, ay, ax1, ay, 1, { color: rgba(C.text, 0.16), head: 12 }); ctx.restore()
          arrow(ax0, ay, ax1, ay, io(prog(t, T[i + 1] - 0.32, 0.3)), { color: c, head: 12 })
        }
        const pulse = 1 + 0.045 * Math.sin(Math.PI * prog(t, T[i], 0.4))
        ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(x + bw / 2, y0 + bh / 2); ctx.scale(lerp(0.9, 1, k) * pulse, lerp(0.9, 1, k) * pulse); ctx.translate(-bw / 2, -bh / 2)
        flowBox(0, 0, bw, bh, lit[i], glow[i], c)
        numberBadge(bw / 2, 22 + br, br, i + 1, lit[i], c)
        const top = 22 + br * 2 + 10, textCy = top + (bh - top - (it.note ? 54 : 16)) / 2
        centred(itemText(it), bw / 2, textCy, bw - 28, { size, weight: 600, color: mix(C.mute, C.text, lit[i]) })
        if (it.note) centred(it.note, bw / 2, bh - 38, bw - 24, { size: Math.min(22, size * 0.7), color: mix(C.mute, C.soft, lit[i]) })
        ctx.restore()
      })
      if (s.loop && n > 1) {
        const xa = L.x0 + (n - 1) * (bw + gap) + bw / 2, xb = L.x0 + bw / 2, ya = y0 + bh + 10, yb = y0 + bh + 44
        const pts = [[xa, ya], [xa, yb], [xb, yb], [xb, ya + 6]]
        ctx.save(); ctx.globalAlpha *= clamp(pop(n - 1)); pathArrow(pts, 1, { color: rgba(C.text, 0.16) }); ctx.restore()
        pathArrow(pts, loopK, { color: c })
      }
      return
    }
    // column: one row per step, arrows running down the badge column
    const loopW = s.loop ? 54 : 0, bw = w - loopW
    const F = ReelFit.fitRows({ avail, row: 104, line: 42, rowPad: 40, tight: 84, pad: (n - 1) * 34, linesAt: (k) => items.map((it) => wrapLines(itemText(it), bw - 150 * k, { size: 36 * k, weight: 600 }).length + (it.note ? 0.7 : 0)) })
    const k0 = F.k, gap = n > 1 ? F.pad / (n - 1) : 0, y0 = L.bodyTop + (avail - F.total) / 2
    let top = y0; const mids = []
    items.forEach((it, i) => {
      const h = F.rows[i], y = top; top += h + gap; mids.push(y + h / 2)
      const k = pop(i); if (k <= 0) return
      if (i < n - 1) {
        const ax = L.x0 + 62 * k0
        ctx.save(); ctx.globalAlpha *= clamp(k); arrow(ax, y + h + 5, ax, y + h + gap - 5, 1, { color: rgba(C.text, 0.16), head: 10 }); ctx.restore()
        arrow(ax, y + h + 5, ax, y + h + gap - 5, io(prog(t, T[i + 1] - 0.3, 0.28)), { color: c, head: 10 })
      }
      ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate((1 - clamp(k)) * 30, 0)
      flowBox(L.x0, y, bw, h, lit[i], glow[i], c, 24)
      numberBadge(L.x0 + 62 * k0, y + h / 2, 28 * k0, i + 1, lit[i], c)
      const lines = wrapLines(itemText(it), bw - 150 * k0, { size: 36 * k0, weight: 600 }), block = lines.length * 42 * k0 + (it.note ? 30 * k0 : 0)
      lines.forEach((l, j) => text(l, L.x0 + 116 * k0, y + h / 2 - block / 2 + 30 * k0 + j * 42 * k0, { size: 36 * k0, weight: 600, color: mix(C.mute, C.text, lit[i]) }))
      if (it.note) text(it.note, L.x0 + 116 * k0, y + h / 2 + block / 2 - 4 * k0, { size: 24 * k0, color: mix(C.mute, C.soft, lit[i]) })
      ctx.restore()
    })
    if (s.loop && n > 1) {
      const xr = L.x0 + bw + 8, xo = L.x1 - 14, pts = [[xr, mids[n - 1]], [xo, mids[n - 1]], [xo, mids[0]], [xr + 6, mids[0]]]
      ctx.save(); ctx.globalAlpha *= clamp(pop(n - 1)); pathArrow(pts, 1, { color: rgba(C.text, 0.16) }); ctx.restore()
      pathArrow(pts, loopK, { color: c })
    }
  },

  /** boxes and arrows. fields: nodes[{id, label, sub, at, tone, col, row}], edges[{from, to, label, at, dashed, tone}], direction: right | down.
      Columns come from the edges (longest path from a source); col/row on a node place it by hand.
      An edge that points back across the diagram runs around the outside. */
  diagram(t, s) {
    const nodes = s.nodes || [], edges = (s.edges || []).filter((e) => e.from !== e.to), n = nodes.length; if (!n) return
    const dir = s.direction || (W >= H ? 'right' : 'down'), right = dir === 'right', G = ReelFit.layoutDiagram(nodes, edges, dir)
    const lane = edges.map((e) => (G.back.has(e.from + '>' + e.to) ? ReelFit.backLane(G.at, e.from, e.to, dir) : null)), LANE = 40
    const room = (side) => (lane.includes(side) ? LANE : 0)
    const ax = L.x0 + room('left'), ay = L.bodyTop + room('top'), w = L.x1 - L.x0 - room('left') - room('right'), avail = L.bodyBottom - L.bodyTop - room('top') - room('bottom')
    const cellW = Math.min(w / G.cols, right ? 400 : 420), cellH = Math.min(avail / G.rows, right ? 190 : 210)
    // labelled edges need room between the boxes they join
    ctx.font = font({ size: 22, weight: 600 })
    const labelW = Math.max(0, ...edges.filter((e, i) => e.label && !lane[i]).map((e) => ctx.measureText(e.label).width))
    const gapX = right ? clamp(labelW + 52, 70, cellW * 0.52) : 30, gapY = right ? 34 : 52
    const bw = Math.min(cellW - gapX, 320), bh = Math.min(cellH - gapY, 128)
    const gx = ax + (w - cellW * G.cols) / 2, gy = ay + (avail - cellH * G.rows) / 2
    const hasSub = nodes.some((nd) => nd.sub), subSize = 20, maxSize = hasSub ? Math.min(32, (bh - 26 - subSize) / 1.15) : 32
    const size = ReelFit.fitText({ size: Math.floor(maxSize), min: 16, maxLines: hasSub || bh < 84 ? 1 : 2, linesAt: (z) => Math.max(...nodes.map((nd) => linesWithin(nd.label ?? nd.id, bw - 26, { size: z, weight: 600 }))) })
    const box = {}, T = {}
    nodes.forEach((nd, i) => {
      const p = G.at[nd.id]
      box[nd.id] = { x: gx + (p.col + 0.5) * cellW - bw / 2, y: gy + (p.row + 0.5) * cellH - bh / 2, w: bw, h: bh }
      T[nd.id] = revealAt(s, { at: nd.at }, i, n)
    })
    const pairs = new Set(edges.map((e) => e.from + '>' + e.to)), labels = []
    edges.forEach((e, i) => {
      const a = box[e.from], b = box[e.to]; if (!a || !b) return
      const back = G.back.has(e.from + '>' + e.to), pa = G.at[e.from], pb = G.at[e.to]
      const t0 = e.at ? wt(s, e.at) : Math.max(T[e.from], T[e.to]) + (back ? 0.15 : -0.3), k = io(prog(t, t0, lane[i] ? 0.6 : 0.38)); if (k <= 0) return
      const c = e.dashed ? C.soft : toneColour(e.tone), acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2
      if (lane[i]) { // around the outside: out of one box, along the lane, into the other
        const side = lane[i], sign = side === 'top' || side === 'left' ? -1 : 1
        const pts = right
          ? [[acx, acy + sign * (bh / 2 + 6)], [acx, sign < 0 ? gy - 14 : gy + cellH * G.rows + 14], [bcx, sign < 0 ? gy - 14 : gy + cellH * G.rows + 14], [bcx, bcy + sign * (bh / 2 + 14)]]
          : [[acx + sign * (bw / 2 + 6), acy], [sign < 0 ? gx - 14 : gx + cellW * G.cols + 14, acy], [sign < 0 ? gx - 14 : gx + cellW * G.cols + 14, bcy], [bcx + sign * (bw / 2 + 14), bcy]]
        pathArrow(pts, k, { color: rgba(c, 0.9), dashed: e.dashed, width: 3.5 })
        if (e.label) labels.push([e.label, (pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2, (k - 0.5) * 2, 'center'])
        return
      }
      // bow the line when it would run through a box in between, or when two nodes point at each other
      const len = Math.hypot(bcx - acx, bcy - acy) || 1
      const skips = (pa.row === pb.row && Math.abs(pa.col - pb.col) > 1) || (pa.col === pb.col && Math.abs(pa.row - pb.row) > 1)
      const bend = e.bend ?? (skips ? (pa.row === pb.row ? bh : bw) + 60 : pairs.has(e.to + '>' + e.from) ? 44 : 0)
      const mx = (acx + bcx) / 2 - (bcy - acy) / len * bend, my = (acy + bcy) / 2 + (bcx - acx) / len * bend
      const p0 = ReelFit.boxEdge(a, mx, my, 6), p1 = ReelFit.boxEdge(b, mx, my, 12), seg = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
      arrow(p0.x, p0.y, p1.x, p1.y, k, { color: rgba(c, 0.9), dashed: e.dashed, bend: bend * 0.8, head: 14, width: 3.5 })
      if (!e.label) return
      const lx = (p0.x + p1.x) / 2 - (p1.y - p0.y) / seg * bend * 0.4, ly = (p0.y + p1.y) / 2 + (p1.x - p0.x) / seg * bend * 0.4
      const upright = Math.abs(p1.x - p0.x) < Math.abs(p1.y - p0.y) // beside a vertical line, on a horizontal one
      labels.push([e.label, upright && !bend ? lx + 16 : lx, upright || bend ? ly : ly - 24, (k - 0.5) * 2, upright && !bend ? 'left' : 'center'])
    })
    nodes.forEach((nd) => {
      const b = box[nd.id], k = outBack(prog(t, T[nd.id], 0.42), 1.5); if (k <= 0) return
      const c = toneColour(nd.tone), glow = 1 - prog(t, T[nd.id] + 0.5, 0.9)
      ctx.save(); ctx.globalAlpha *= clamp(k * 1.5); ctx.translate(b.x + bw / 2, b.y + bh / 2); ctx.scale(lerp(0.8, 1, k), lerp(0.8, 1, k)); ctx.translate(-bw / 2, -bh / 2)
      flowBox(0, 0, bw, bh, nd.tone === 'mute' ? 0 : 0.7, glow, c, 22)
      centred(nd.label ?? nd.id, bw / 2, bh / 2 - (nd.sub ? subSize * 0.62 : 0) + 1, bw - 26, { size, weight: 600, color: nd.tone === 'mute' ? 'soft' : 'text' })
      if (nd.sub) text(nd.sub, bw / 2, bh / 2 + size * 0.58, { size: subSize, align: 'center', base: 'middle', color: 'soft' })
      ctx.restore()
    })
    for (const [label, x, y, alpha, align] of labels) if (alpha > 0) edgeLabel(label, x, y, alpha, align)
  },

  /** bar chart that grows. fields: bars[{label, value, at, tone, display}], prefix, suffix, decimals, max, direction: horizontal | vertical, note */
  bars(t, s) {
    const bars = s.bars || [], n = bars.length; if (!n) return
    const w = L.x1 - L.x0, avail = L.bodyBottom - L.bodyTop, x = L.x0
    const top = s.max || Math.max(1e-9, ...bars.map((b) => Number(b.value) || 0))
    const fmt = (v) => (s.prefix || '') + v.toFixed(s.decimals || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (s.suffix || '')
    const T = bars.map((b, i) => revealAt(s, b, i, n)), grow = T.map((ti) => io(prog(t, ti, 0.9))), lit = T.map((ti) => outCubic(prog(t, ti, 0.3)))
    const shown = (b, i) => (b.display && grow[i] >= 1 ? b.display : fmt((Number(b.value) || 0) * grow[i]))
    const final = (b) => b.display || fmt(Number(b.value) || 0)
    const noteH = s.note ? 44 : 0
    if (s.direction === 'vertical') {
      const h = Math.min(avail, 520), y0 = L.bodyTop + (avail - h) / 2, colW = (w - 60) / n, barW = Math.min(120, colW * 0.56)
      const labelSize = ReelFit.fitText({ size: 28, min: 18, maxLines: 2, linesAt: (z) => Math.max(...bars.map((b) => wrapLines(b.label || '', colW - 14, { size: z, weight: 600 }).length)) })
      const base = y0 + h - 84 - noteH, maxH = base - (y0 + 84)
      panel(x, y0, w, h)
      ctx.fillStyle = rgba(C.text, 0.12); ctx.fillRect(x + 30, base, w - 60, 2)
      bars.forEach((b, i) => {
        const cx = x + 30 + (i + 0.5) * colW, bhh = maxH * clamp((Number(b.value) || 0) / top) * grow[i], c = toneColour(b.tone)
        centred(b.label || '', cx, base + 38, colW - 14, { size: labelSize, weight: 600, color: mix(C.mute, C.text, lit[i]) })
        if (grow[i] <= 0) return
        ctx.save(); glow(rgba(c, 0.35), 24); rr(cx - barW / 2, base - Math.max(bhh, 6), barW, Math.max(bhh, 6), [12, 12, 0, 0]); ctx.fillStyle = c; ctx.fill(); ctx.restore()
        ctx.save(); ctx.globalAlpha *= lit[i]; text(shown(b, i), cx, base - Math.max(bhh, 6) - 16, { size: 32, weight: 700, align: 'center' }); ctx.restore()
      })
      if (s.note) text(s.note, x + w / 2, y0 + h - 26, { size: 22, color: 'mute', align: 'center' })
      return
    }
    const k0 = clamp((avail - 60 - noteH) / (n * 92), 0.5, 1), rowH = 92 * k0, h = n * rowH + 60 * k0 + noteH, y0 = L.bodyTop + (avail - h) / 2
    const ls = 32 * k0, vs = 32 * k0
    ctx.font = font({ size: ls, weight: 600 }); const labelW = Math.min(w * 0.36, Math.max(...bars.map((b) => ctx.measureText(b.label || '').width)))
    ctx.font = font({ size: vs, weight: 700 }); const valueW = Math.max(...bars.map((b) => ctx.measureText(final(b)).width))
    const xb = x + 40 + labelW + 24, xe = x + w - 40 - valueW - 18, barH = 34 * k0 // values sit in their own column on the right
    panel(x, y0, w, h)
    bars.forEach((b, i) => {
      const cy = y0 + 30 * k0 + (i + 0.5) * rowH, c = toneColour(b.tone), len = Math.max(barH, (xe - xb) * clamp((Number(b.value) || 0) / top)) * grow[i]
      const lines = wrapLines(b.label || '', labelW + 2, { size: ls, weight: 600 }).slice(0, 2)
      lines.forEach((l, j) => text(l, x + 40, cy + (j - (lines.length - 1) / 2) * ls * 1.12 + 1, { size: ls, weight: 600, base: 'middle', color: mix(C.mute, C.text, lit[i]) }))
      rr(xb, cy - barH / 2, xe - xb, barH, barH / 2); ctx.fillStyle = rgba(C.text, 0.06); ctx.fill()
      if (grow[i] <= 0) return
      ctx.save(); glow(rgba(c, 0.4), 22); rr(xb, cy - barH / 2, Math.max(len, barH * 0.6), barH, barH / 2); ctx.fillStyle = c; ctx.fill(); ctx.restore()
      ctx.save(); ctx.globalAlpha *= lit[i]; text(shown(b, i), x + w - 40, cy + 1, { size: vs, weight: 700, base: 'middle', align: 'right' }); ctx.restore()
    })
    if (s.note) text(s.note, x + 40, y0 + h - 26, { size: 22, color: 'mute' })
  },
})
