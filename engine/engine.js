/* reel-studio engine. Every frame is a pure function of t, so renders are deterministic.
   Scenes come from the timeline (script.json + voice timings); look comes from brand.json.
   Custom scene types: define window.CUSTOM = { name(t, s, api) {...} } in <project>/custom.js
   and use {"type": "custom", "fn": "name"} in the script. */
'use strict'
const cv = document.getElementById('c'), ctx = cv.getContext('2d')
let W = 1080, H = 1920, L = {}, C = {}, B = {}, TL = null, S = {}, IMG = {}, FD = {}, FB = {}, FM = {}
/* ST: the brand's "style" (corners, shadow, border, captions, ...). MO: its motion feel. Both default to the classic look. */
const STYLE = { corners: 1, shadow: 'soft', border: 2, borderColor: null, glow: true, motion: 'smooth', transition: 'rise', captions: 'outline', captionCase: 'none', captionFont: 'body', titleCase: 'none' }
/* over: overshoot of pop-ins. rise: how far scenes travel as they change. speed: length of short entrances (1 = as written). */
const MOTION = { smooth: { over: 1, rise: 1, speed: 1 }, calm: { over: 0, rise: 0.45, speed: 1.25 }, bouncy: { over: 1.5, rise: 1.2, speed: 1 }, snappy: { over: 0.3, rise: 0.6, speed: 0.6 } }
let ST = { ...STYLE }, MO = MOTION.smooth
/* PR: output pixels per layout pixel. OPT: render options from the command line. REC: text boxes recorded for lint. */
let PR = 1, OPT = {}, REC = null

/* ---------- math ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, k) => a + (b - a) * k
const io = (k) => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const outBack = (k, s = 1.6) => (k = clamp(k), s *= MO.over, 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2))
const outCubic = (k) => 1 - Math.pow(1 - clamp(k), 3)
const prog = (t, a, d) => clamp((t - a) / (d <= 0.6 ? d * MO.speed : d))
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})` }
const col = (c) => (!c ? C.text : c[0] === '#' ? c : C[c] || c)

/* ---------- layout per format (TikTok/Reels safe area for vertical) ----------
   W and H are layout pixels. `embed` lays out on 1600x900 and renders at 1920x1080, so type is 1.2x larger
   than `landscape` and stays readable when the video sits in a web page column. brand.density does the
   same for any format (see ReelFit.densify). */
const LAYOUTS = {
  vertical: { W: 1080, H: 1920, tagY: 330, headY: 470, bodyTop: 640, bodyBottom: 1250, capBase: 1420, capMaxW: 820, capSize: 58, capCx: 520, progY: 236, x0: 120, x1: 940, titleSize: 88 },
  square: { W: 1080, H: 1080, tagY: 90, headY: 170, bodyTop: 300, bodyBottom: 800, capBase: 1000, capMaxW: 900, capSize: 48, capCx: 540, progY: 40, x0: 110, x1: 970, titleSize: 68 },
  landscape: { W: 1920, H: 1080, tagY: 90, headY: 180, bodyTop: 300, bodyBottom: 820, capBase: 1000, capMaxW: 1400, capSize: 52, capCx: 960, progY: 40, x0: 460, x1: 1460, titleSize: 76 },
  embed: { W: 1600, H: 900, outW: 1920, outH: 1080, tagY: 78, headY: 152, bodyTop: 250, bodyBottom: 690, capBase: 838, capMaxW: 1180, capSize: 46, capCx: 800, progY: 34, x0: 300, x1: 1300, titleSize: 68 },
}

/* ---------- timing helpers ---------- */
/** time a word is spoken in scene s: the first word equal to it (punctuation and case ignored), else the first word that starts with it */
function wt(s, word) {
  const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''), k = norm(word)
  let prefix = null
  for (const c of s.chunks) for (const w of c.words) {
    const n = norm(w.w)
    if (n === k) return w.t
    if (prefix === null && k && n.startsWith(k)) prefix = w.t
  }
  return prefix ?? s.start + 0.4
}
/** when item i of n appears: its "at" keyword, else a stagger across the voice-over */
function revealAt(s, item, i, n) {
  if (item && typeof item === 'object' && item.at) return wt(s, item.at)
  const span = Math.max(0.6, s.voice - 0.5)
  return s.start + 0.35 + i * Math.min(0.55, span / Math.max(1, n))
}
const itemText = (it) => (typeof it === 'string' ? it : it.text)

/* ---------- drawing primitives ---------- */
/** corner radius after the brand's style.corners (1 = as drawn, 0 = square) */
const rad = (r) => (ST.corners === 1 ? r : Array.isArray(r) ? r.map((v) => Math.max(0, v * ST.corners)) : Math.max(0, r * ST.corners))
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad(r)) }
/** soft coloured glow behind what is drawn next (off when style.glow is false) */
function glow(c, blur) { if (ST.glow) { ctx.shadowColor = c; ctx.shadowBlur = blur } }
/** title text in the brand's titleCase */
const cased = (s) => (ST.titleCase === 'upper' ? String(s).toUpperCase() : s)
function font(o = {}) {
  if (o.mono) return `${o.italic ? 'italic ' : ''}${o.weight || 500} ${o.size || 34}px "${FM.family}", ui-monospace, "DejaVu Sans Mono", monospace`
  const f = o.display ? FD : FB
  const style = o.display ? (o.italic ?? f.style === 'italic' ? 'italic ' : '') : (o.italic ? 'italic ' : '')
  return `${style}${o.weight || (o.display ? f.weight : 500)} ${o.size || 34}px "${f.family}", system-ui, sans-serif`
}
function text(s, x, y, o = {}) {
  ctx.font = font(o)
  ctx.fillStyle = col(o.color); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic'
  ctx.letterSpacing = (o.ls || 0) + 'px'
  ctx.fillText(s, x, y); const m = ctx.measureText(s), w = m.width; ctx.letterSpacing = '0px'
  if (REC) recordText(s, x, y, m)
  return w
}
/** lint only: the box a drawn string covers, in layout pixels */
function recordText(s, x, y, m) {
  if (ctx.globalAlpha < 0.05 || !String(s).trim()) return
  const T = ctx.getTransform(), xs = [], ys = []
  for (const [px, py] of [[x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent], [x + m.actualBoundingBoxRight, y - m.actualBoundingBoxAscent], [x - m.actualBoundingBoxLeft, y + m.actualBoundingBoxDescent], [x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent]]) {
    xs.push((T.a * px + T.c * py + T.e) / PR); ys.push((T.b * px + T.d * py + T.f) / PR)
  }
  REC.push({ s: String(s), x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
}
function wrapLines(s, maxW, o = {}) {
  ctx.font = font(o)
  const out = []
  for (const para of String(s).split('\n')) {
    let line = ''
    for (const w of para.split(' ')) {
      const t = line ? line + ' ' + w : w
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t
    }
    out.push(line)
  }
  return out
}
function wrap(s, x, y, maxW, o = {}) {
  const lines = wrapLines(s, maxW, o), lh = o.lh || (o.size || 34) * 1.3
  lines.forEach((l, i) => text(l, x, y + i * lh, o))
  return lines.length * lh
}
/** the shadow under a surface, from style.shadow: soft (default), faint, hard (a solid offset block) or none.
    Call it before filling the surface at the same x, y, w, h, r. */
function dropShadow(x, y, w, h, r, o = {}) {
  if (ST.shadow === 'hard') { const d = o.hard ?? 12; rr(x + d, y + d, w, h, r); ctx.fillStyle = C.shadow; ctx.fill(); return }
  if (ST.shadow === 'none') return
  const faint = ST.shadow === 'faint'
  ctx.shadowColor = faint ? rgba(C.shadow, 0.16) : o.color || 'rgba(0,0,0,0.5)'; ctx.shadowBlur = faint ? (o.blur ?? 50) * 0.7 : o.blur ?? 50; ctx.shadowOffsetY = faint ? (o.dy ?? 24) * 0.6 : o.dy ?? 24
}
function panel(x, y, w, h, o = {}) {
  const b = ST.border
  ctx.save()
  dropShadow(x, y, w, h, o.r ?? 40)
  rr(x, y, w, h, o.r ?? 40); ctx.fillStyle = col(o.fill || 'panel'); ctx.fill()
  ctx.restore()
  if (!b) return
  rr(x + b / 2, y + b / 2, w - b, h - b, (o.r ?? 40) - b / 2); ctx.strokeStyle = o.stroke || (ST.borderColor ? col(ST.borderColor) : rgba(C.accent, 0.16)); ctx.lineWidth = b; ctx.stroke()
}
function avatar(cx, cy, r, initials, c = C.accent) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = col(c); ctx.fill()
  text(initials || '', cx, cy + 1, { size: r * 0.72, weight: 700, align: 'center', base: 'middle', color: C.onAccent })
}
function icon(kind, cx, cy, r, k = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k)
  const c = kind === 'cross' ? C.bad : kind === 'check' ? C.good : C.accent
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = rgba(c, 0.18); ctx.fill()
  ctx.strokeStyle = c; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
  if (kind === 'check') { ctx.moveTo(-r * 0.42, 0); ctx.lineTo(-r * 0.1, r * 0.32); ctx.lineTo(r * 0.45, -r * 0.35); ctx.stroke() }
  else if (kind === 'cross') { ctx.moveTo(-r * 0.35, -r * 0.35); ctx.lineTo(r * 0.35, r * 0.35); ctx.moveTo(r * 0.35, -r * 0.35); ctx.lineTo(-r * 0.35, r * 0.35); ctx.stroke() }
  else if (/^\d+$/.test(String(kind))) text(String(kind), 0, 2, { size: r * 1.05, weight: 700, align: 'center', base: 'middle', color: c })
  else { ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill() }
  ctx.restore()
}
function star(cx, cy, r, fill) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad) }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
}
const TONES = () => ({
  problem: { fill: rgba(C.bad, 0.16), stroke: rgba(C.bad, 0.55), color: C.badHi, dot: C.bad, head: C.text, glow: C.bad },
  fix: { fill: rgba(C.good, 0.18), stroke: rgba(C.good, 0.7), color: C.goodHi, dot: C.good, head: C.accent, glow: C.accent },
  neutral: { fill: rgba(C.accent, 0.14), stroke: rgba(C.accent, 0.55), color: C.accent, dot: C.accent, head: C.text, glow: C.accent },
})
const tone = (s) => TONES()[s.tone] || TONES().neutral
function pill(cx, cy, label, o = {}) {
  const size = o.size || 28
  ctx.font = font({ size, weight: 700 }); ctx.letterSpacing = (o.ls ?? 3) + 'px'
  const tw = ctx.measureText(label).width; ctx.letterSpacing = '0px'
  const dot = o.dot ? size * 0.9 : 0, w = tw + size * 1.6 + dot, h = size * 2
  rr(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = o.fill || rgba(C.accent, 0.14); ctx.fill()
  ctx.strokeStyle = o.stroke || rgba(C.accent, 0.5); ctx.lineWidth = 2; ctx.stroke()
  if (o.dot) { ctx.beginPath(); ctx.arc(cx - w / 2 + size * 0.8 + 6, cy, 7, 0, Math.PI * 2); ctx.fillStyle = o.dot; ctx.fill() }
  text(label, cx + dot / 2, cy + 1, { size, weight: 700, align: 'center', base: 'middle', color: o.color || C.accent, ls: o.ls ?? 3 })
  return w
}
function stamp(t, t0, cx, cy, label, c = C.bad, rot = -0.12) {
  const k = prog(t, t0, 0.32); if (k <= 0) return
  const sc = lerp(2.2, 1, outBack(k, 1.2))
  ctx.save(); ctx.globalAlpha *= clamp(k * 2); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc)
  ctx.font = font({ size: 58, weight: 800 }); ctx.letterSpacing = '4px'
  const w = ctx.measureText(label).width + 70; ctx.letterSpacing = '0px'
  rr(-w / 2, -50, w, 100, 18); ctx.fillStyle = rgba(C.bg, 0.82); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.stroke()
  text(label, 0, 4, { size: 58, weight: 800, align: 'center', base: 'middle', color: c, ls: 4 })
  ctx.restore()
}
function button(cx, cy, label, k = 1, o = {}) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k)
  ctx.font = font({ size: o.size || 38, weight: 700 })
  const w = Math.max(o.minW || 0, ctx.measureText(label).width + 110), h = (o.size || 38) * 2.3
  if (ST.shadow === 'hard') { rr(-w / 2 + 7, -h / 2 + 7, w, h, h / 2); ctx.fillStyle = C.shadow; ctx.fill() }
  else glow(rgba(col(o.fill || 'accent'), 0.45), 30)
  rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = col(o.fill || 'accent'); ctx.fill(); ctx.shadowBlur = 0
  if (ST.shadow === 'hard' && ST.border) { ctx.strokeStyle = col(ST.borderColor || 'text'); ctx.lineWidth = ST.border; ctx.stroke() }
  text(label, 0, 2, { size: o.size || 38, weight: 700, align: 'center', base: 'middle', color: o.color || C.onAccent })
  ctx.restore()
}
/** brand mark: logo image if given, else the text wordmark (parts with their own colours) */
function brandMark(cx, cy, size, a = 1) {
  ctx.save(); ctx.globalAlpha *= a
  if (B.logo && IMG[B.logo]) {
    const im = IMG[B.logo], h = size * 1.6, w = im.width / im.height * h
    ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h)
  } else {
    const parts = B.wordmark || [{ text: B.name || 'Brand' }]
    ctx.font = font({ display: true, size }); const tw = parts.reduce((s, p) => s + ctx.measureText(p.text).width, 0)
    let x = cx - tw / 2
    for (const p of parts) x += text(p.text, x, cy + size * 0.33, { display: true, size, color: p.color || 'text' })
  }
  ctx.restore()
}
function drawImage(src, x, y, w, h, r = 32, zoom = 1) {
  const im = IMG[src]; if (!im) { panel(x, y, w, h, { r }); text('missing: ' + src, x + w / 2, y + h / 2, { align: 'center', color: 'mute', size: 26 }); return }
  ctx.save(); rr(x, y, w, h, r); ctx.clip()
  const s = Math.max(w / im.width, h / im.height) * zoom, iw = im.width * s, ih = im.height * s
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore()
  rr(x + 1, y + 1, w - 2, h - 2, r - 1); ctx.strokeStyle = rgba(C.accent, 0.2); ctx.lineWidth = 2; ctx.stroke()
}

/** arrow from (x0,y0) to (x1,y1), drawn up to progress k (0..1). o: color, width, head, dashed, bend (px, bows the line sideways) */
function arrow(x0, y0, x1, y1, k = 1, o = {}) {
  k = clamp(k); if (k <= 0) return
  const c = col(o.color || 'accent'), head = o.head ?? 16, bend = o.bend || 0
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1
  const mx = (x0 + x1) / 2 - dy / len * bend, my = (y0 + y1) / 2 + dx / len * bend
  const at = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1]
  ctx.save(); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = o.width || 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (o.dashed) ctx.setLineDash([12, 12])
  const n = 24, last = Math.max(1, Math.round(n * k)); ctx.beginPath(); ctx.moveTo(x0, y0)
  for (let i = 1; i <= last; i++) ctx.lineTo(...at(i / n * (k * n / last)))
  ctx.stroke(); ctx.setLineDash([])
  if (head) {
    const [tx, ty] = at(k), [bx, by] = at(Math.max(0, k - 0.08)), a = Math.atan2(ty - by, tx - bx)
    ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * head * 0.5, ty + Math.sin(a) * head * 0.5)
    ctx.lineTo(tx + Math.cos(a + 2.5) * head, ty + Math.sin(a + 2.5) * head); ctx.lineTo(tx + Math.cos(a - 2.5) * head, ty + Math.sin(a - 2.5) * head); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

/** Shrink what is drawn next so a block `h` pixels tall fits the body area (never enlarges). Returns the scale used.
    Call it inside a scene, after measuring the block and before drawing it. */
function fitBody(h) {
  const k = Math.min(1, (L.bodyBottom - L.bodyTop) / h)
  if (k < 1) { const cx = W / 2, cy = (L.bodyTop + L.bodyBottom) / 2; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy) }
  return k
}

/* ---------- scene header: tag pill + headline ---------- */
function header(t, s, A) {
  const T = tone(s)
  if (s.tag) {
    ctx.save(); ctx.globalAlpha = A.a
    const k = outBack(prog(t, s.start, 0.45), 2)
    ctx.translate(W / 2, L.tagY); ctx.scale(k, k)
    pill(0, 0, s.tag, { fill: T.fill, stroke: T.stroke, color: T.color, dot: T.dot })
    ctx.restore()
  }
  if (s.title) {
    ctx.save(); ctx.globalAlpha = A.a
    const k = outCubic(prog(t, s.start + 0.05, 0.45)); ctx.translate(A.dx || 0, (1 - k) * 30 * MO.rise + A.dy * 0.4)
    const size = s.titleSize || (s.title.length > 26 ? L.titleSize * 0.86 : L.titleSize)
    const lines = wrapLines(cased(s.title), L.x1 - L.x0, { display: true, size }), lh = size * 1.02
    if (s.tone === 'fix') glow(rgba(C.accent, 0.35), 24)
    lines.forEach((l, i) => text(l, W / 2, L.headY + 40 + i * lh - (lines.length - 1) * lh / 2, { display: true, size, align: 'center', color: T.head }))
    ctx.restore()
  }
}

/* ---------- scene types (filled by scenes.js and scenes-explain.js) ---------- */
const TYPES = {}

/* ---------- frame chrome ---------- */
function sceneAlpha(t, s, i) {
  const a = outCubic(prog(t, s.start - 0.08, 0.38)), last = i === TL.scenes.length - 1
  const e = last ? 0 : io(prog(t, s.end - 0.26, 0.26))
  if (ST.transition === 'fade') return { a: a * (1 - e), dy: 0 }
  if (ST.transition === 'slide') return { a: a * (1 - e), dy: 0, dx: ((1 - a) * 140 - e * 110) * MO.rise }
  if (ST.transition === 'cut') { const on = prog(t, s.start - 0.04, 0.07) * (last ? 1 : 1 - prog(t, s.end - 0.05, 0.05)); return { a: on, dy: 0 } }
  return { a: a * (1 - e), dy: ((1 - a) * 70 - e * 50) * MO.rise }
}
function current(t) { return TL.scenes.find((s) => t >= s.start - 0.08 && t < s.end) || TL.scenes[TL.scenes.length - 1] }
function drawProgress(t) {
  const steps = TL.scenes.filter((s) => s.step), total = Math.max(0, ...steps.map((s) => s.step)); if (!total) return
  const sc = current(t); if (!sc.step) return
  const segW = Math.min(112, (L.x1 - L.x0) / total - 12), x0 = W / 2 - total * (segW + 12) / 2 + 6
  for (let i = 1; i <= total; i++) {
    const done = i < sc.step || (i === sc.step && sc.tone === 'fix')
    rr(x0 + (i - 1) * (segW + 12), L.progY, segW, 10, 5)
    ctx.fillStyle = done ? C.good : i === sc.step ? (sc.tone === 'problem' ? C.bad : C.accent) : rgba(C.text, 0.16); ctx.fill()
  }
}
/** seeded random numbers (the same sequence on every frame and every machine) */
function seeded(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let v = Math.imul(seed ^ seed >>> 15, 1 | seed); v = v + Math.imul(v ^ v >>> 7, 61 | v) ^ v; return ((v ^ v >>> 14) >>> 0) / 4294967296 } }
/* backgrounds beside the classic glow: each draws on top of the flat bg colour */
const BACKDROPS = {
  /** ruled grid drifting slowly down, darker towards the edges */
  grid(t) {
    const step = 64, off = (t * 5) % step
    ctx.strokeStyle = rgba(C.pattern, 0.075); ctx.lineWidth = 1; ctx.beginPath()
    for (let x = (W / 2) % step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
    for (let y = off - step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
    ctx.stroke()
    const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.max(W, H) * 0.72)
    g.addColorStop(0, rgba(C.bg, 0)); g.addColorStop(1, rgba(C.bg, 0.92)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  },
  /** paper grain (it does not move) and a thin rule set in from the edge */
  paper() {
    const rnd = seeded(7)
    for (let i = 0; i < 1500; i++) { ctx.fillStyle = rgba(C.text, 0.03 + rnd() * 0.05); ctx.fillRect(rnd() * W, rnd() * H, 2, 2) }
    const m = Math.round(Math.min(W, H) * 0.03)
    ctx.strokeStyle = rgba(C.text, 0.22); ctx.lineWidth = 2; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m)
  },
  /** large soft colour fields that drift slowly */
  blobs(t) {
    const R0 = Math.max(W, H) * 0.5, cols = [C.accent, C.accent2, C.good, C.accent2]
    const spots = [[0.18, 0.2, 0.9], [0.86, 0.34, 1], [0.3, 0.82, 1.05], [0.9, 0.9, 0.8]]
    spots.forEach(([fx, fy, k], i) => {
      const x = W * fx + Math.sin(t * 0.21 + i * 1.7) * W * 0.06, y = H * fy + Math.cos(t * 0.17 + i * 2.3) * H * 0.04, r = R0 * k
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, rgba(cols[i], 0.27)); g.addColorStop(0.5, rgba(cols[i], 0.11)); g.addColorStop(1, rgba(cols[i], 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    })
  },
  /** slanted tone-on-tone bands that slide slowly sideways */
  stripes(t) {
    const band = 120, off = (t * 12) % (band * 2), far = Math.max(W, H) * 1.6
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.42); ctx.fillStyle = rgba(C.pattern, 0.45)
    for (let x = -far + off; x < far; x += band * 2) ctx.fillRect(x, -far, band, far * 2)
    ctx.restore()
  },
}
function background(t, sc) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)
  if (B.background === 'plain') return
  if (BACKDROPS[B.background]) { ctx.save(); BACKDROPS[B.background](t, sc); ctx.restore(); return }
  const T = tone(sc || {})
  const g = ctx.createRadialGradient(W / 2, H * 0.43, 40, W / 2, H * 0.47, Math.max(W, H) * 0.6)
  g.addColorStop(0, rgba(T.glow, sc?.tone === 'problem' ? 0.07 : 0.085)); g.addColorStop(0.55, rgba(C.accent2, 0.025)); g.addColorStop(1, rgba(C.bg, 0))
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  if (B.background === 'glow') return
  ctx.fillStyle = rgba(C.accent, 0.07)
  const off = (t * 8) % 60
  for (let y = -60; y < H; y += 60) for (let x = 0; x < W; x += 60) {
    const d = Math.hypot(x - W / 2, y - H * 0.45) / (Math.max(W, H) * 0.47); if (d > 1) continue
    ctx.globalAlpha = 1 - d; ctx.fillRect(x + 30, y + off, 3, 3)
  }
  ctx.globalAlpha = 1
}
const captionsOn = () => (OPT.captions ?? TL.captions ?? B.captions) !== false
/** caption words of one chunk wrapped to the caption width (sets the caption font) */
const capFont = () => font(ST.captionFont === 'display' ? { display: true, size: L.capSize } : { size: L.capSize, weight: 700 })
function capLines(c) {
  ctx.font = capFont()
  const space = ctx.measureText(' ').width, lines = [[]], upper = ST.captionCase === 'upper'
  let lw = 0
  c.words.forEach((w) => {
    if (upper) w = { ...w, w: w.w.toUpperCase() }
    const ww = ctx.measureText(w.w).width
    if (lw + ww > L.capMaxW && lines[lines.length - 1].length) { lines.push([]); lw = 0 }
    lines[lines.length - 1].push({ ...w, ww }); lw += ww + space
  })
  return { lines, space }
}
function drawCaptions(t) {
  if (!captionsOn()) return
  const chunks = TL.scenes.flatMap((s) => s.chunks)
  let ci = -1
  chunks.forEach((c, i) => { if (t >= c.words[0].t - 0.08) ci = i })
  if (ci < 0) return
  const c = chunks[ci], next = chunks[ci + 1], lastW = c.words[c.words.length - 1]
  const outK = next ? prog(t, next.words[0].t - 0.16, 0.1) : prog(t, lastW.t + 1.2, 0.3)
  if (outK >= 1) return
  ctx.save()
  const { lines, space } = capLines(c); ctx.textBaseline = 'alphabetic'
  const lh = L.capSize * 1.24, baseY = L.capBase - (lines.length - 1) * lh
  if (ST.captions === 'box' || ST.captions === 'highlight') { captionBlocks(t, c, lines, space, lh, baseY, 1 - outK); ctx.restore(); return }
  lines.forEach((line, li) => {
    const total = line.reduce((s, w) => s + w.ww, 0) + space * (line.length - 1)
    let x = L.capCx - total / 2
    line.forEach((w) => {
      const k = outCubic(prog(t, w.t - 0.05, 0.18))
      ctx.globalAlpha = k * (1 - outK)
      ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = C.capStroke
      ctx.strokeText(w.w, x, baseY + li * lh + (1 - k) * 12)
      ctx.fillStyle = w.key ? C.capKey : C.capText
      ctx.fillText(w.w, x, baseY + li * lh + (1 - k) * 12)
      x += w.ww + space
    })
  })
  ctx.restore()
}
/** caption styles "box" (each line on a solid strip) and "highlight" (a block behind the word being spoken).
    The whole phrase is on screen from its first word; words not yet spoken are dimmed. */
function captionBlocks(t, c, lines, space, lh, baseY, vis) {
  const size = L.capSize, box = ST.captions === 'box', inK = outCubic(prog(t, c.words[0].t - 0.08, 0.16)) * vis
  let now = null
  for (const w of c.words) if (t >= w.t - 0.03) now = w.t
  lines.forEach((line, li) => {
    const total = line.reduce((s, w) => s + w.ww, 0) + space * (line.length - 1), y = baseY + li * lh
    let x = L.capCx - total / 2
    if (box) { ctx.globalAlpha = inK; rr(x - size * 0.42, y - size * 0.93, total + size * 0.84, size * 1.26, size * 0.28); ctx.fillStyle = C.capBg; ctx.fill() }
    line.forEach((w) => {
      const said = t >= w.t - 0.03, cur = !box && said && w.t === now
      if (cur) { const k = outCubic(prog(t, w.t - 0.03, 0.12)); ctx.globalAlpha = inK * k; rr(x - size * 0.2, y - size * 0.9, w.ww + size * 0.4, size * 1.2, size * 0.24); ctx.fillStyle = C.accent; ctx.fill() }
      ctx.globalAlpha = inK * (said ? 1 : 0.42)
      if (!box && !cur) { ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = C.capStroke; ctx.strokeText(w.w, x, y) }
      ctx.fillStyle = cur ? C.onAccent : w.key && said ? C.capKey : C.capText
      ctx.fillText(w.w, x, y)
      x += w.ww + space
    })
  })
}
function frame(t) {
  ctx.setTransform(PR, 0, 0, PR, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0
  background(t, current(t))
  TL.scenes.forEach((s, i) => {
    if (t < s.start - 0.1 || t > s.end + 0.02) return
    const A = sceneAlpha(t, s, i); if (A.a <= 0.001) return
    const draw = TYPES[s.type] || TYPES.title
    if (s.type !== 'title' && s.type !== 'cta') header(t, s, A)
    ctx.save(); ctx.globalAlpha = A.a; ctx.translate(A.dx || 0, A.dy)
    draw(t, s, A)
    if (s.stamp) stamp(t, s.stamp.at ? wt(s, s.stamp.at) : s.start + s.voice * 0.75, W / 2, (L.bodyTop + L.bodyBottom) / 2, s.stamp.label, (TONES()[s.stamp.tone] || TONES().problem).dot)
    ctx.restore()
  })
  drawProgress(t)
  drawCaptions(t)
}

/* exposed to custom.js */
const API = { ctx, get W() { return W }, get H() { return H }, get L() { return L }, get C() { return C }, get IMG() { return IMG }, get style() { return ST }, glow, cased,
  clamp, lerp, io, outBack, outCubic, prog, rgba, col, wt, revealAt, itemText, rr, text, wrap, wrapLines, panel, avatar, icon, star, pill, stamp, button, arrow, fitBody, brandMark, drawImage, tone, TONES, TYPES, fit: globalThis.ReelFit }

function loadImg(url) { return new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = url }) }

/** layout and output size for a brand: format, then density, then any manual layout numbers */
function resolveLayout(brand) {
  const base = LAYOUTS[brand.format || 'vertical'] || LAYOUTS.vertical, manual = brand.layout || {}
  const dense = brand.density && brand.density !== 1 ? ReelFit.densify(base, brand.density) : base
  const lay = { ...dense, ...manual }
  // a manual W or H without outW keeps the old behaviour: one output pixel per layout pixel
  const outW = manual.outW ?? (manual.W || manual.H ? lay.W : dense.outW ?? lay.W)
  return { lay, outW: ReelFit.even(outW), outH: ReelFit.even(outW * lay.H / lay.W) }
}
window.setup = async ({ timeline, brand, base, fonts, custom, opts }) => {
  TL = timeline; B = brand; OPT = opts || {}; IMG = {}; S = Object.fromEntries(TL.scenes.map((s) => [s.id, s]))
  const R = resolveLayout(B)
  L = R.lay; W = L.W; H = L.H; PR = R.outW / W; cv.width = R.outW; cv.height = R.outH
  const c = B.colors || {}
  C = { bg: '#14110E', panel: '#221D19', panel2: '#2A231E', text: '#F5F0E8', soft: '#B9AEA2', mute: '#7D7268',
    accent: '#E8A678', accent2: '#C8956C', good: '#5A8F65', goodHi: '#9CC7A5', bad: '#D2675B', badHi: '#F0A79D', ...c }
  ST = { ...STYLE, ...(B.style || {}) }; MO = MOTION[ST.motion] || MOTION.smooth
  const lightBg = ReelFit.luminance(C.bg) > 0.4
  // colours a brand may set, each with a default that keeps the classic look: text on accent and on good fills,
  // hard and faint shadows, and the caption colours
  C = { onAccent: C.bg, onGood: '#ffffff', shadow: ST.shadow === 'hard' ? C.text : '#000000', capText: ST.captions === 'box' ? C.bg : C.text, capKey: C.accent, capBg: C.text, pattern: B.background === 'stripes' ? C.accent2 : C.accent,
    capStroke: ST.captions === 'outline' && !lightBg ? 'rgba(10,8,6,0.85)' : rgba(C.bg, 0.9), ...C, ...c }
  document.body.style.background = C.bg
  FD = { family: 'Display', style: 'normal', weight: 600, ...(fonts.display || {}) }; FB = { family: 'Body', ...(fonts.body || {}) }; FM = { family: 'Mono', ...(fonts.mono || {}) }
  for (const f of [FD, FB, FM]) if (f.url) { const ff = new FontFace(f.family, `url("${f.url}")`, { style: f.style || 'normal', weight: '100 900' }); document.fonts.add(await ff.load()) }
  const srcs = new Set([B.logo, ...TL.scenes.flatMap((s) => [s.src, ...(s.images || [])])].filter(Boolean))
  await Promise.all([...srcs].map(async (s) => { const im = await loadImg(new URL(s, base).href); if (im) IMG[s] = im; else console.error('image not found: ' + s) }))
  if (custom) await new Promise((r) => { const el = document.createElement('script'); el.src = custom; el.onload = r; el.onerror = () => { console.error('custom.js failed'); r() }; document.head.appendChild(el) })
  return { W: cv.width, H: cv.height, layoutW: W, layoutH: H, missingCustom: TL.scenes.filter((s) => s.type === 'custom' && !(window.CUSTOM && window.CUSTOM[s.fn])).map((s) => s.id) }
}
window.renderAt = (t) => { frame(t); return true }

/* ---------- lint: draw one scene on an empty canvas and measure what it covers ---------- */
function inkBox() {
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data, w = cv.width, h = cv.height
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w * 4 + 3; x < w; x++, i += 4) if (d[i] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return x1 < 0 ? null : { x0: x0 / PR, y0: y0 / PR, x1: (x1 + 1) / PR, y1: (y1 + 1) / PR }
}
function measure(draw) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.setTransform(PR, 0, 0, PR, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0; REC = []
  let error = null
  ctx.save(); try { draw() } catch (e) { error = String(e && e.message || e) } ctx.restore()
  const texts = REC; REC = null
  return { ink: inkBox(), texts, error }
}
/** Body and header of scene i when it is fully built, measured in layout pixels. Shadows (alpha below 0.8) do not count. */
window.lintScene = (i) => {
  const s = TL.scenes[i], last = i === TL.scenes.length - 1, t = last ? s.start + s.voice + 0.6 : Math.max(s.start + s.voice * 0.85 + 0.2, s.end - 0.3), A = { a: 1, dy: 0 }
  const body = measure(() => (TYPES[s.type] || TYPES.title)(t, s, A))
  const head = s.type === 'title' || s.type === 'cta' ? { ink: null, texts: [] } : measure(() => header(t, s, A))
  const caps = (s.chunks || []).map((c) => { const { lines } = capLines(c); return { lines: lines.length, widest: Math.max(...lines.map((l) => l.reduce((a, w) => a + w.ww, 0))) } })
  const capLinesMax = Math.max(1, ...caps.map((c) => c.lines))
  return { id: s.id, type: s.type, t, body, head, capTop: captionsOn() ? L.capBase - (capLinesMax - 1) * L.capSize * 1.24 - L.capSize * 0.82 : null, capWidest: Math.max(0, ...caps.map((c) => c.widest)),
    layout: { W, H, x0: L.x0, x1: L.x1, bodyTop: L.bodyTop, bodyBottom: L.bodyBottom, capMaxW: L.capMaxW, bleed: ST.shadow === 'hard' ? 12 : 0 } }
}
window.API = API
