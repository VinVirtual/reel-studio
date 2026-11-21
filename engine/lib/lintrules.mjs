// Lint rules for a reel-studio script. Pure: file checks go through an `exists(path)` function that the
// caller supplies, and geometry checks work on measurements taken in the real engine (window.lintScene).
// Every rule returns issues shaped { level: 'error' | 'warn', scene, rule, message }.

const COMMON = ['id', 'type', 'say', 'keys', 'tone', 'tag', 'title', 'titleSize', 'step', 'stamp', 'hold', 'sfx', 'voice', 'speed', 'images']
export const SCENE_FIELDS = {
  title: ['kicker', 'sub', 'chips'],
  bullets: ['items', 'icon', 'rowH'],
  chat: ['contact', 'avatar', 'presence', 'items', 'typing', 'unread'],
  card: ['avatar', 'name', 'meta', 'badge', 'badgeAt', 'rating', 'rows', 'button', 'buttonAt', 'status'],
  stat: ['value', 'count', 'label', 'note', 'size'],
  compare: ['left', 'right', 'variant'],
  quote: ['text', 'author', 'meta', 'stars'],
  image: ['src', 'caption', 'frame'],
  cta: ['comment', 'button', 'buttonAt', 'url'],
  steps: ['items', 'direction', 'loop', 'loopAt'],
  diagram: ['nodes', 'edges', 'direction'],
  bars: ['bars', 'prefix', 'suffix', 'decimals', 'max', 'direction', 'note'],
  custom: null, // any field: custom.js decides
}
export const SCRIPT_FIELDS = ['lead', 'pause', 'tail', 'scenes', 'voice', 'speed', 'music', 'fps', 'caption_words', 'captions', 'poster']
export const BRAND_FIELDS = ['name', 'format', 'density', 'wordmark', 'logo', 'colors', 'fonts', 'background', 'captions', 'voice', 'speed', 'lang', 'pronounce', 'music', 'layout']
export const FORMATS = ['vertical', 'square', 'landscape', 'embed']
const ENUMS = { tone: ['problem', 'fix', 'neutral'], sfx: ['thud', 'chime', 'whoosh', 'none'] }
/** most words allowed on screen, from the "Writing the script" rules in SKILL.md */
export const WORD_LIMITS = { headline: 4, hook: 6, tag: 4, item: 5, chip: 3, label: 3, quote: 16 }
/** scene types whose body must stay inside the body area */
const BODY_TYPES = new Set(['bullets', 'chat', 'card', 'compare', 'quote', 'steps', 'diagram', 'bars', 'custom'])

const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
const words = (s) => String(s || '').split(/\s+/).filter(Boolean)
const countWords = (s) => words(String(s || '').replace(/\n/g, ' ')).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const textOf = (it) => (typeof it === 'string' ? it : it && it.text)
const issue = (level, scene, rule, message) => ({ level, scene, rule, message })

/** does `at` match a spoken word the way the engine matches it (start of a word, punctuation ignored)? */
export function spokenMatch(say, at) {
  const k = norm(at)
  return !!k && words(say).some((w) => norm(w).startsWith(k))
}

/** every { where, word } in a scene that is timed to a spoken word */
export function atWords(sc) {
  const out = [], add = (where, word) => { if (word !== undefined && word !== null && word !== '') out.push({ where, word }) }
  const list = (name, arr) => (Array.isArray(arr) ? arr : []).forEach((it, i) => { if (it && typeof it === 'object') add(`${name}[${i}].at`, it.at) })
  list('items', sc.items); list('rows', sc.rows); list('chips', sc.chips); list('nodes', sc.nodes); list('edges', sc.edges); list('bars', sc.bars)
  list('left.items', sc.left && sc.left.items); list('right.items', sc.right && sc.right.items)
  for (const k of ['badgeAt', 'buttonAt', 'loopAt']) add(k, sc[k])
  for (const k of ['stamp', 'status', 'count', 'typing']) if (sc[k] && typeof sc[k] === 'object') add(`${k}.at`, sc[k].at)
  return out
}

function checkWords(sc, id) {
  const out = [], spoken = words(sc.say)
  for (const key of Array.isArray(sc.keys) ? sc.keys : []) {
    if (spoken.includes(key)) continue
    const near = spoken.find((w) => norm(w) === norm(key))
    out.push(issue('error', id, 'keys', `keys: "${key}" is not a word of "say"${near ? ` (write it exactly as spoken: "${near}")` : ''}`))
  }
  for (const { where, word } of atWords(sc)) if (!spokenMatch(sc.say, word)) out.push(issue('error', id, 'at', `${where}: "${word}" is never spoken in "say", so it would appear at a default time`))
  return out
}

function checkLength(sc, id) {
  const out = [], over = (what, text, max) => { const n = countWords(text); if (n > max) out.push(issue('warn', id, 'length', `${what} has ${n} words (guide: ${max} or fewer): "${String(text).replace(/\n/g, ' ')}"`)) }
  if (sc.title) over('title', sc.title, sc.type === 'title' || sc.type === 'cta' ? WORD_LIMITS.hook : WORD_LIMITS.headline)
  if (sc.tag) over('tag', sc.tag, WORD_LIMITS.tag)
  if (sc.kicker) over('kicker', sc.kicker, WORD_LIMITS.hook)
  const each = (name, arr, max) => (Array.isArray(arr) ? arr : []).forEach((it, i) => over(`${name}[${i}]`, textOf(it), max))
  if (sc.type !== 'chat') each('items', sc.items, WORD_LIMITS.item)
  each('chips', sc.chips, WORD_LIMITS.chip)
  each('left.items', sc.left && sc.left.items, WORD_LIMITS.item); each('right.items', sc.right && sc.right.items, WORD_LIMITS.item)
  ;(Array.isArray(sc.nodes) ? sc.nodes : []).forEach((n, i) => over(`nodes[${i}].label`, n.label ?? n.id, WORD_LIMITS.label))
  ;(Array.isArray(sc.bars) ? sc.bars : []).forEach((b, i) => over(`bars[${i}].label`, b.label, WORD_LIMITS.label))
  if (sc.type === 'quote') over('text', sc.text, WORD_LIMITS.quote)
  if (sc.type === 'stat' && sc.label) over('label', sc.label, WORD_LIMITS.item)
  return out
}

function checkShape(sc, id, types) {
  const out = []
  if (!sc.type) out.push(issue('error', id, 'type', 'no "type"'))
  else if (!types.includes(sc.type)) { out.push(issue('error', id, 'type', `unknown scene type "${sc.type}" (known: ${types.join(', ')})`)); return out }
  const allowed = SCENE_FIELDS[sc.type]
  if (allowed) for (const k of Object.keys(sc)) if (!COMMON.includes(k) && !allowed.includes(k)) out.push(issue('warn', id, 'field', `unknown field "${k}" for type "${sc.type}" (it is ignored)`))
  for (const [k, values] of Object.entries(ENUMS)) if (sc[k] !== undefined && !values.includes(sc[k])) out.push(issue('error', id, 'value', `${k}: "${sc[k]}" is not one of ${values.join(', ')}`))
  const oneOf = (k, values) => { if (sc[k] !== undefined && !values.includes(sc[k])) out.push(issue('error', id, 'value', `${k}: "${sc[k]}" is not one of ${values.join(', ')}`)) }
  if (sc.type === 'custom' && !sc.fn) out.push(issue('error', id, 'value', 'custom scene needs "fn", the name of a function in custom.js'))
  if (sc.type === 'compare') { oneOf('variant', ['neutral', 'before-after']); if (!sc.left && !sc.right) out.push(issue('error', id, 'value', 'compare needs "left" and "right"')) }
  if (sc.type === 'steps') { oneOf('direction', ['row', 'column']); if (!Array.isArray(sc.items) || !sc.items.length) out.push(issue('error', id, 'value', 'steps needs "items"')) }
  if (sc.type === 'image' && !sc.src) out.push(issue('error', id, 'value', 'image needs "src"'))
  if (sc.type === 'diagram') {
    oneOf('direction', ['right', 'down'])
    const nodes = Array.isArray(sc.nodes) ? sc.nodes : [], ids = nodes.map((n) => n && n.id)
    if (!nodes.length) out.push(issue('error', id, 'value', 'diagram needs "nodes"'))
    ids.forEach((nid, i) => { if (!nid) out.push(issue('error', id, 'value', `nodes[${i}] has no "id"`)); else if (ids.indexOf(nid) !== i) out.push(issue('error', id, 'value', `nodes[${i}]: id "${nid}" is used twice`)) })
    ;(Array.isArray(sc.edges) ? sc.edges : []).forEach((e, i) => { for (const end of ['from', 'to']) if (!ids.includes(e[end])) out.push(issue('error', id, 'value', `edges[${i}].${end}: no node with id "${e[end]}"`)) })
  }
  if (sc.type === 'bars') {
    oneOf('direction', ['horizontal', 'vertical'])
    const bars = Array.isArray(sc.bars) ? sc.bars : []
    if (!bars.length) out.push(issue('error', id, 'value', 'bars needs "bars"'))
    bars.forEach((b, i) => { if (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0) out.push(issue('error', id, 'value', `bars[${i}].value must be a number of 0 or more (got ${JSON.stringify(b.value)})`)) })
  }
  return out
}

function checkFiles(sc, id, exists) {
  const out = []
  for (const src of [sc.src, ...(Array.isArray(sc.images) ? sc.images : [])].filter(Boolean)) if (!exists(src)) out.push(issue('error', id, 'file', `image not found: ${src}`))
  return out
}

/** Rules that need only the script and brand. opts: { exists(projectRelativePath), bundledFont(basename), types } */
export function lintScript(script, brand = {}, opts = {}) {
  const exists = opts.exists || (() => true), bundledFont = opts.bundledFont || (() => false), types = opts.types || Object.keys(SCENE_FIELDS)
  const out = []
  if (!script || !Array.isArray(script.scenes) || !script.scenes.length) return [issue('error', '-', 'script', 'the script has no "scenes" list')]
  for (const k of Object.keys(script)) if (!SCRIPT_FIELDS.includes(k)) out.push(issue('warn', '-', 'field', `unknown script field "${k}" (it is ignored)`))
  for (const k of Object.keys(brand)) if (!BRAND_FIELDS.includes(k)) out.push(issue('warn', 'brand', 'field', `unknown brand field "${k}" (it is ignored)`))
  if (brand.format !== undefined && !FORMATS.includes(brand.format)) out.push(issue('error', 'brand', 'value', `format: "${brand.format}" is not one of ${FORMATS.join(', ')}`))
  if (brand.background !== undefined && !['glow-dots', 'glow', 'plain'].includes(brand.background)) out.push(issue('error', 'brand', 'value', `background: "${brand.background}" is not one of glow-dots, glow, plain`))
  if (brand.density !== undefined && !(typeof brand.density === 'number' && brand.density >= 1 && brand.density <= 2)) out.push(issue('error', 'brand', 'value', `density: ${JSON.stringify(brand.density)} must be a number from 1 to 2`))
  if (brand.logo && !exists(brand.logo)) out.push(issue('error', 'brand', 'file', `logo not found: ${brand.logo}`))
  for (const role of ['display', 'body']) {
    const f = brand.fonts && brand.fonts[role]
    if (f && f.file && !exists(f.file) && !bundledFont(f.file)) out.push(issue('error', 'brand', 'file', `fonts.${role}: font file not found: ${f.file} (a system font would be used)`))
  }
  if (script.scenes.some((s) => s && s.type === 'custom') && !exists('custom.js')) out.push(issue('error', '-', 'file', 'the script has custom scenes but the project has no custom.js'))
  const seen = new Set()
  script.scenes.forEach((sc, i) => {
    const id = sc && sc.id ? String(sc.id) : `#${i + 1}`
    if (!sc || typeof sc !== 'object') { out.push(issue('error', id, 'script', 'scene is not an object')); return }
    if (!sc.id) out.push(issue('error', id, 'id', 'no "id"'))
    else if (!/^[\w-]+$/.test(sc.id)) out.push(issue('error', id, 'id', 'id may use only letters, digits, "-" and "_" (it becomes a file name)'))
    else if (seen.has(sc.id)) out.push(issue('error', id, 'id', `id "${sc.id}" is used twice`))
    seen.add(sc.id)
    if (typeof sc.say !== 'string' || !sc.say.trim()) out.push(issue('error', id, 'say', 'no "say" (every scene needs a spoken line)'))
    out.push(...checkShape(sc, id, types), ...checkWords(sc, id), ...checkLength(sc, id), ...checkFiles(sc, id, exists))
  })
  return out
}

const px = (n) => `${Math.round(n)} px`
/** share of the smaller box that two text boxes have in common */
export function overlapShare(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  if (w <= 0 || h <= 0) return 0
  const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0))
  return small > 0 ? (w * h) / small : 0
}

/** Rules on one scene measured in the engine (the object window.lintScene returns). */
export function lintGeometry(m, { tolerance = 6, overlap = 0.25 } = {}) {
  const out = [], id = m.id, Lay = m.layout, body = m.body || {}, head = m.head || {}
  if (body.error) out.push(issue('error', id, 'draw', `the scene failed to draw: ${body.error}`))
  if (head.error) out.push(issue('error', id, 'draw', `the header failed to draw: ${head.error}`))
  const ink = body.ink
  if (ink) {
    if (BODY_TYPES.has(m.type)) {
      if (ink.y1 > Lay.bodyBottom + tolerance) out.push(issue('error', id, 'overflow', `content overflows the bottom of the body area by ${px(ink.y1 - Lay.bodyBottom)}: shorten or split the scene`))
      if (ink.y0 < Lay.bodyTop - tolerance) out.push(issue('error', id, 'overflow', `content overflows the top of the body area by ${px(Lay.bodyTop - ink.y0)}`))
      if (ink.x0 < Lay.x0 - tolerance || ink.x1 > Lay.x1 + tolerance) out.push(issue('warn', id, 'overflow', `content is wider than the content area by ${px(Math.max(Lay.x0 - ink.x0, ink.x1 - Lay.x1))}`))
    }
    if (ink.x0 <= 0 || ink.y0 <= 0 || ink.x1 >= Lay.W || ink.y1 >= Lay.H) out.push(issue('warn', id, 'overflow', 'content reaches the edge of the frame and may be cut off'))
    if (m.capTop !== null && m.capTop !== undefined && ink.y1 > m.capTop + tolerance && !(BODY_TYPES.has(m.type) && ink.y1 > Lay.bodyBottom + tolerance)) out.push(issue('warn', id, 'overflow', `content reaches ${px(ink.y1 - m.capTop)} into the caption area`))
  }
  const texts = body.texts || []
  for (const t of texts) {
    if (t.x0 < -1 || t.x1 > Lay.W + 1) out.push(issue('error', id, 'text', `text runs off the frame: "${t.s}"`))
    else if (m.type !== 'title' && (t.x0 < Lay.x0 - tolerance || t.x1 > Lay.x1 + tolerance)) out.push(issue('warn', id, 'text', `text is wider than the content area: "${t.s}"`))
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (overlapShare(texts[i], texts[j]) >= overlap) out.push(issue('warn', id, 'text', `text overlaps: "${texts[i].s}" and "${texts[j].s}"`))
  }
  if (head.ink) {
    const top = ink && BODY_TYPES.has(m.type) ? Math.min(ink.y0, Lay.bodyTop) : Lay.bodyTop
    if (head.ink.y1 > top + tolerance) out.push(issue('warn', id, 'overflow', `the headline runs ${px(head.ink.y1 - top)} into the body: shorten the title or set titleSize`))
    if (head.ink.y0 <= 0) out.push(issue('warn', id, 'overflow', 'the headline reaches the top of the frame'))
    for (const t of head.texts || []) if (t.x0 < Lay.x0 - tolerance || t.x1 > Lay.x1 + tolerance) out.push(issue('warn', id, 'text', `headline text is wider than the content area: "${t.s}"`))
  }
  if (m.capTop !== null && m.capTop !== undefined && m.capWidest > Lay.capMaxW + tolerance) out.push(issue('warn', id, 'text', 'a caption word is wider than the caption area'))
  return out
}

/** "error  scene  message" lines plus a count line */
export function formatIssues(issues) {
  const errors = issues.filter((i) => i.level === 'error').length, warns = issues.length - errors
  const w = Math.max(5, ...issues.map((i) => String(i.scene).length))
  const lines = issues.map((i) => `${i.level === 'error' ? 'error' : 'warn '}  ${String(i.scene).padEnd(w)}  ${i.message}`)
  return [...lines, issues.length ? `${errors} error(s), ${warns} warning(s)` : 'no problems found'].join('\n')
}
