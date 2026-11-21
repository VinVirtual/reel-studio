/* reel-studio built-in scene types. Loaded after engine.js; every function draws one scene body at time t.
   Draw only from t and the scene data, so a frame never depends on the frames before it. */
'use strict'
Object.assign(TYPES, {
  /** big opening/closing statement. fields: kicker, title, sub, chips[] */
  title(t, s) {
    const cy = (L.bodyTop + L.bodyBottom) / 2 - 40
    if (s.kicker) { const k = outBack(prog(t, s.start, 0.45), 2); ctx.save(); ctx.translate(W / 2, cy - L.titleSize * 2.1); ctx.scale(k, k); const T = tone(s); pill(0, 0, s.kicker, { fill: T.fill, stroke: T.stroke, color: T.color, dot: T.dot }); ctx.restore() }
    const size = s.titleSize || L.titleSize * 1.25
    const lines = wrapLines(s.title || '', L.x1 - L.x0, { display: true, size }), lh = size * 1.02
    lines.forEach((l, i) => {
      const k = outBack(prog(t, s.start + 0.1 + i * 0.22, 0.5), 1.4)
      ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(W / 2, cy + i * lh - (lines.length - 1) * lh / 2); ctx.scale(lerp(0.85, 1, k), lerp(0.85, 1, k))
      text(l, 0, size * 0.33, { display: true, size, align: 'center', color: i === lines.length - 1 ? C.accent : C.text }); ctx.restore()
    })
    if (s.sub) { const k = outCubic(prog(t, s.start + 0.5, 0.5)); ctx.save(); ctx.globalAlpha *= k; wrap(s.sub, W / 2, cy + lines.length * lh / 2 + 70, L.x1 - L.x0, { size: 40, align: 'center', color: 'soft' }); ctx.restore() }
    // chip slots: [x 0..1 across content, y as offset band: -1 above the title block, +1 below it, rotation]
    const slots = [[0.2, -1, -0.08], [0.8, -1.22, 0.07], [0.2, 1, 0.06], [0.8, 1.15, -0.06], [0.5, -1.45, 0.03], [0.5, 1.35, -0.03]]
    ;(s.chips || []).forEach((c, i) => {
      const [fx, fy, rot] = slots[i % slots.length], k = outBack(prog(t, revealAt(s, c, i, s.chips.length) + 0.3, 0.4), 2)
      if (k <= 0) return
      const half = L.titleSize * 2.1 + (s.kicker ? 120 : 40), y = cy + fy * (fy < 0 ? half + 20 : half - 40 + (s.sub ? 90 : 0)) + Math.sin(t * 1.6 + i) * 6
      ctx.save(); ctx.translate(lerp(L.x0 + 90, L.x1 - 90, fx), y); ctx.rotate(rot); ctx.scale(k, k)
      const T = TONES()[c.tone] || tone(s); pill(0, 0, itemText(c), { fill: T.fill, stroke: T.stroke, color: T.color, size: 30, ls: 0.5 }); ctx.restore()
    })
  },

  /** list with check / cross / number / dot icons. fields: items[{text, at, icon}], icon, rowH.
      Rows shrink together until the list fits the body; rowH switches that off and fixes the row height. */
  bullets(t, s) {
    const items = s.items || [], w = L.x1 - L.x0
    const F = ReelFit.fitRows({ avail: L.bodyBottom - L.bodyTop, fixedRow: s.rowH, linesAt: (k) => items.map((it) => wrapLines(itemText(it), w - 160 * k, { size: 40 * k, weight: 600 }).length) })
    const k0 = F.k, h = F.total, y0 = Math.max(L.bodyTop, (L.bodyTop + L.bodyBottom - h) / 2)
    panel(L.x0, y0, w, h)
    let top = y0 + F.pad / 2
    items.forEach((it, i) => {
      const rowH = F.rows[i], y = top + rowH / 2; top += rowH
      const k = outCubic(prog(t, revealAt(s, it, i, items.length), 0.35)); if (k <= 0) return
      const kind = it.icon || s.icon || (s.tone === 'problem' ? 'cross' : s.tone === 'fix' ? 'check' : i + 1)
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 40, 0)
      icon(kind, L.x0 + 70 * k0, y, 30 * k0, outBack(k, 2))
      const lines = wrapLines(itemText(it), w - 160 * k0, { size: 40 * k0, weight: 600 })
      lines.forEach((l, j) => text(l, L.x0 + 125 * k0, y + 14 * k0 + (j - (lines.length - 1) / 2) * 48 * k0, { size: 40 * k0, weight: 600 }))
      if (i < items.length - 1) { ctx.fillStyle = rgba(C.text, 0.07); ctx.fillRect(L.x0 + 40, top, w - 80, 2) }
      ctx.restore()
    })
  },

  /** message thread. fields: contact, avatar, items[{from: me|them, text, at, status}], typing, unread */
  chat(t, s) {
    const items = s.items || [], w = L.x1 - L.x0, x = L.x0
    const laid = items.map((it) => {
      const lines = wrapLines(it.text, w * 0.62, { size: 32 }); ctx.font = font({ size: 32 })
      return { it, lines, bw: Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56, bh: lines.length * 42 + 36 }
    })
    const h = 170 + laid.reduce((a, b) => a + b.bh + (b.it.status ? 52 : 24), 0) + (s.typing ? 90 : 0)
    const y0 = fitBody(h) < 1 ? (L.bodyTop + L.bodyBottom - h) / 2 : Math.max(L.bodyTop, (L.bodyTop + L.bodyBottom - h) / 2)
    panel(x, y0, w, h)
    avatar(x + 70, y0 + 64, 34, s.avatar || (s.contact || '?').slice(0, 2).toUpperCase(), C.accent2)
    text(s.contact || 'Contact', x + 122, y0 + 58, { size: 34, weight: 700 })
    text(s.presence || 'last seen recently', x + 122, y0 + 96, { size: 24, color: 'mute' })
    ctx.fillStyle = rgba(C.text, 0.08); ctx.fillRect(x + 30, y0 + 128, w - 60, 2)
    let y = y0 + 158
    laid.forEach(({ it, lines, bw, bh }, i) => {
      const k = outBack(prog(t, revealAt(s, it, i, items.length), 0.35), 1.6)
      if (k > 0) {
        const me = it.from !== 'them', bx = me ? x + w - 34 - bw : x + 34, ax = me ? bx + bw : bx
        ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(ax, y); ctx.scale(k, k); ctx.translate(-ax, -y)
        rr(bx, y, bw, bh, 28); ctx.fillStyle = me ? rgba(C.accent, 0.22) : C.panel2; ctx.fill()
        lines.forEach((l, j) => text(l, bx + 28, y + 46 + j * 42, { size: 32 }))
        if (it.status) text(it.status, me ? bx + bw - 8 : bx + 8, y + bh + 34, { size: 22, color: 'mute', align: me ? 'right' : 'left' })
        ctx.restore()
      }
      y += bh + (it.status ? 52 : 24)
    })
    if (s.typing && t > revealAt(s, typeof s.typing === 'object' ? s.typing : null, items.length, items.length + 1)) {
      rr(x + 34, y, 120, 64, 32); ctx.fillStyle = C.panel2; ctx.fill()
      for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.arc(x + 66 + d * 28, y + 32 + Math.sin(t * 8 - d) * 5, 7, 0, Math.PI * 2); ctx.fillStyle = C.soft; ctx.fill() }
    }
  },

  /** profile / booking / product card. fields: avatar, name, meta, badge, rating, rows[{label, value, at}], button, buttonAt, status{label, at, tone} */
  card(t, s) {
    const rows = s.rows || [], w = L.x1 - L.x0, x = L.x0
    const h = 170 + rows.length * 86 + (s.button ? 140 : 30)
    const y0 = (L.bodyTop + L.bodyBottom - h) / 2
    fitBody(h); panel(x, y0, w, h)
    avatar(x + 86, y0 + 86, 50, s.avatar || (s.name || '?').slice(0, 2).toUpperCase(), C.accent)
    text(s.name || '', x + 160, y0 + 78, { size: 40, weight: 700 })
    if (s.meta) text(s.meta, x + 160, y0 + 120, { size: 28, color: 'soft' })
    if (s.badge) {
      const k = outBack(prog(t, s.badgeAt ? wt(s, s.badgeAt) : s.start + 0.5, 0.4), 2)
      if (k > 0) { ctx.save(); ctx.translate(x + w - 120, y0 + 70); ctx.scale(k, k); pill(0, 0, s.badge, { size: 22, ls: 1, fill: rgba(C.good, 0.2), stroke: rgba(C.good, 0.7), color: C.goodHi, dot: C.good }); ctx.restore() }
    }
    if (s.rating) { for (let i = 0; i < 5; i++) star(x + w - 250 + i * 34, y0 + 128, 13, i < Math.round(s.rating) ? C.accent : rgba(C.text, 0.2)); text(String(s.rating), x + w - 40, y0 + 138, { size: 28, weight: 700, align: 'right' }) }
    rows.forEach((r, i) => {
      const k = outCubic(prog(t, revealAt(s, r, i, rows.length), 0.35)); if (k <= 0) return
      const y = y0 + 190 + i * 86
      ctx.save(); ctx.globalAlpha *= k; ctx.translate((1 - k) * 30, 0)
      rr(x + 40, y, w - 80, 70, 18); ctx.fillStyle = C.panel2; ctx.fill()
      text(r.label, x + 70, y + 46, { size: 28, color: 'soft' })
      text(r.value, x + w - 70, y + 46, { size: 30, weight: 700, align: 'right', color: r.color })
      ctx.restore()
    })
    if (s.button) {
      const tb = s.buttonAt ? wt(s, s.buttonAt) : s.start + s.voice * 0.7, k = outBack(prog(t, tb - 0.3, 0.4), 1.8)
      const press = 1 - 0.06 * Math.sin(Math.PI * prog(t, tb, 0.25))
      if (k > 0) button(x + w / 2, y0 + h - 80, s.button, k * press, { fill: 'good', color: '#fff' })
    }
    if (s.status) { const st = s.status, T = TONES()[st.tone] || TONES().fix; stamp(t, st.at ? wt(s, st.at) : s.start + s.voice * 0.8, W / 2, y0 + h / 2, st.label, T.dot) }
  },

  /** big number. fields: value ("0") or count{from,to,prefix,suffix,decimals,at}, label, note */
  stat(t, s) {
    const cy = (L.bodyTop + L.bodyBottom) / 2
    let v = s.value || ''
    if (s.count) {
      const c = s.count, t0 = c.at ? wt(s, c.at) : s.start + 0.3, k = io(prog(t, t0, c.dur || 1.2))
      v = (c.prefix || '') + lerp(c.from ?? 0, c.to, k).toFixed(c.decimals || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c.suffix || '')
    }
    const k = outBack(prog(t, s.start + 0.1, 0.5), 1.5), size = s.size || L.titleSize * 2.2
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(k, k)
    ctx.shadowColor = rgba(C.accent, 0.4); ctx.shadowBlur = 40
    text(v, 0, size * 0.33, { display: true, size, align: 'center', color: s.tone === 'problem' ? C.bad : C.accent }); ctx.restore()
    if (s.label) { const kl = outCubic(prog(t, s.start + 0.45, 0.4)); ctx.save(); ctx.globalAlpha *= kl; wrap(s.label, W / 2, cy + size * 0.55 + 40, L.x1 - L.x0, { size: 44, weight: 600, align: 'center' }); ctx.restore() }
    if (s.note) { const kn = outCubic(prog(t, s.start + 0.8, 0.4)); ctx.save(); ctx.globalAlpha *= kn; wrap(s.note, W / 2, cy + size * 0.55 + 120, L.x1 - L.x0, { size: 30, align: 'center', color: 'soft' }); ctx.restore() }
  },

  /** two columns. fields: left{label, items, tone, icon}, right{...}, variant.
      Default: left is "before" (crosses, red), right is "after" (checks, green).
      variant "neutral" draws both sides alike (accent colour, dots) for plain side-by-side content.
      A side's own tone (problem | fix | neutral) or icon overrides either. Rows shrink together to fit the body. */
  compare(t, s) {
    const gap = 30, w = (L.x1 - L.x0 - gap) / 2, sides = [s.left, s.right]
    const n = Math.max(s.left?.items?.length || 0, s.right?.items?.length || 0)
    const linesAt = (k) => Array.from({ length: n }, (_, i) => Math.max(1, ...sides.map((sd) => (sd?.items?.[i] ? wrapLines(itemText(sd.items[i]), w - 110 * k, { size: 30 * k, weight: 600 }).length : 1))))
    const F = ReelFit.fitRows({ avail: L.bodyBottom - L.bodyTop, linesAt, row: 100, line: 36, rowPad: 28, pad: 130 })
    const k0 = F.k, h = F.total, y0 = (L.bodyTop + L.bodyBottom - h) / 2
    const LOOK = { problem: ['cross', C.bad], fix: ['check', C.good], neutral: ['dot', C.accent] }
    sides.forEach((side, si) => {
      if (!side) return
      const [kind, c] = LOOK[side.tone] || LOOK[s.variant === 'neutral' ? 'neutral' : si ? 'fix' : 'problem']
      const x = L.x0 + si * (w + gap), kk = outCubic(prog(t, s.start + si * (s.voice * 0.45), 0.4)); if (kk <= 0) return
      ctx.save(); ctx.globalAlpha *= kk; ctx.translate(0, (1 - kk) * 40)
      panel(x, y0, w, h, { stroke: rgba(c, 0.45) })
      text(side.label || '', x + w / 2, y0 + 70 * k0, { size: 34 * k0, weight: 700, align: 'center', color: c })
      let top = y0 + 100 * k0
      ;(side.items || []).forEach((it, i) => {
        const rowTop = top; top += F.rows[i]
        const k = outCubic(prog(t, si ? revealAt(s, it, i + n, n * 2) : revealAt(s, it, i, n * 2), 0.3)); if (k <= 0) return
        ctx.save(); ctx.globalAlpha *= k
        icon(it.icon || side.icon || kind, x + 50 * k0, rowTop + 50 * k0, 22 * k0)
        wrap(itemText(it), x + 88 * k0, rowTop + 60 * k0, w - 110 * k0, { size: 30 * k0, weight: 600, lh: 36 * k0 })
        ctx.restore()
      })
      ctx.restore()
    })
  },

  /** review card. fields: text, author, meta, stars */
  quote(t, s) {
    const w = L.x1 - L.x0, lines = wrapLines(`“${s.text}”`, w - 120, { display: true, size: 52 }), h = 200 + lines.length * 64
    const y0 = (L.bodyTop + L.bodyBottom - h) / 2
    fitBody(h); panel(L.x0, y0, w, h)
    for (let i = 0; i < 5; i++) { const k = outBack(prog(t, s.start + 0.2 + i * 0.08, 0.3), 2.5); if (k > 0) { ctx.save(); ctx.translate(L.x0 + 80 + i * 52, y0 + 70); ctx.scale(k, k); star(0, 0, 20, i < (s.stars ?? 5) ? C.accent : rgba(C.text, 0.2)); ctx.restore() } }
    lines.forEach((l, i) => { const k = outCubic(prog(t, s.start + 0.4 + i * 0.25, 0.4)); ctx.save(); ctx.globalAlpha *= k; text(l, L.x0 + 60, y0 + 160 + i * 64, { display: true, size: 52 }); ctx.restore() })
    const k = outCubic(prog(t, s.start + 0.8, 0.4)); ctx.save(); ctx.globalAlpha *= k
    text('— ' + (s.author || ''), L.x0 + 60, y0 + h - 50, { size: 30, weight: 600, color: 'soft' })
    if (s.meta) text(s.meta, L.x1 - 60, y0 + h - 50, { size: 26, color: 'mute', align: 'right' })
    ctx.restore()
  },

  /** real screenshot / photo with a slow push-in. fields: src (project-relative), caption, frame: phone|plain */
  image(t, s) {
    const avail = L.bodyBottom - L.bodyTop, im = IMG[s.src]
    const ratio = im ? im.width / im.height : 0.6
    let h = avail + (s.tag ? 0 : 140), w = h * ratio
    if (w > L.x1 - L.x0) { w = L.x1 - L.x0; h = w / ratio }
    const x = W / 2 - w / 2, y = (s.tag || s.title ? L.bodyTop : L.bodyTop - 140) + (avail + (s.tag || s.title ? 0 : 140) - h) / 2
    const k = outCubic(prog(t, s.start, 0.5))
    ctx.save(); ctx.translate(0, (1 - k) * 60)
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30; rr(x, y, w, h, 36); ctx.fillStyle = C.panel; ctx.fill(); ctx.shadowBlur = 0
    drawImage(s.src, x, y, w, h, 36, 1 + 0.06 * prog(t, s.start, s.end - s.start))
    ctx.restore()
  },

  /** closing call to action. fields: title, comment ("@yourfriend"), button, url */
  cta(t, s) {
    const cy = (L.bodyTop + L.bodyBottom) / 2
    brandMark(W / 2, cy - 230, 110, outCubic(prog(t, s.start, 0.5)))
    if (s.title) { const k = outCubic(prog(t, s.start + 0.2, 0.4)); ctx.save(); ctx.globalAlpha *= k; wrap(s.title, W / 2, cy - 90, L.x1 - L.x0, { display: true, size: 58, align: 'center' }); ctx.restore() }
    if (s.comment) {
      const k = outCubic(prog(t, s.start + 0.4, 0.4)), w = L.x1 - L.x0 - 80, y = cy - 20
      ctx.save(); ctx.globalAlpha *= k; rr(W / 2 - w / 2, y, w, 96, 48); ctx.fillStyle = C.panel2; ctx.fill(); ctx.strokeStyle = rgba(C.accent, 0.3); ctx.lineWidth = 2; ctx.stroke()
      const typed = s.comment.slice(0, Math.floor(clamp((t - s.start - 0.8) / 1.2) * s.comment.length))
      const tw = text(typed, W / 2 - w / 2 + 40, y + 60, { size: 36, weight: 600, color: 'accent' })
      if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = C.accent; ctx.fillRect(W / 2 - w / 2 + 46 + tw, y + 28, 3, 42) }
      ctx.restore()
    }
    if (s.button) { const tb = s.buttonAt ? wt(s, s.buttonAt) : s.start + s.voice * 0.6; const k = outBack(prog(t, tb - 0.2, 0.45), 1.8); if (k > 0) button(W / 2, cy + 180 + Math.sin(t * 3) * 4, s.button, k) }
    if (s.url) { const k = outCubic(prog(t, s.start + s.voice * 0.7, 0.4)); ctx.save(); ctx.globalAlpha *= k; text(s.url, W / 2, cy + 300, { size: 36, weight: 600, align: 'center' }); ctx.restore() }
  },

  custom(t, s, A) {
    const fn = window.CUSTOM && window.CUSTOM[s.fn]
    if (!fn) { text(`custom.js: no CUSTOM.${s.fn}`, W / 2, H / 2, { align: 'center', color: 'bad' }); return }
    fn(t, s, API, A)
  },
})
