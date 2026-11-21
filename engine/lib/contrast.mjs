// Text contrast of a brand: every pair of colours that the engine puts text on, with its WCAG ratio.
// Used by lint (a warning when a pair is hard to read) and by the tests that check every bundled theme.
import '../fit.js'

const { contrast, luminance } = globalThis.ReelFit
export { contrast, luminance }

/** the engine's default palette (engine.js setup) */
export const DEFAULT_COLORS = { bg: '#14110E', panel: '#221D19', panel2: '#2A231E', text: '#F5F0E8', soft: '#B9AEA2', mute: '#7D7268',
  accent: '#E8A678', accent2: '#C8956C', good: '#5A8F65', goodHi: '#9CC7A5', bad: '#D2675B', badHi: '#F0A79D' }

const isHex = (c) => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)

/** the palette the engine ends up with for a brand, derived colours included */
export function resolveColors(brand = {}) {
  const C = { ...DEFAULT_COLORS, ...(brand.colors || {}) }, style = brand.style || {}, captions = style.captions || 'outline'
  const light = isHex(C.bg) && luminance(C.bg) > 0.4
  return { onAccent: C.bg, onGood: '#ffffff', capText: captions === 'box' ? C.bg : C.text, capKey: C.accent, capBg: C.text,
    capStroke: captions === 'outline' && !light ? '#0A0806' : C.bg, ...C }
}

/** [{ what, fg, bg, ratio, min }] for a brand. min is 4.5 for running text and 3 for large or bold text. */
export function brandContrast(brand = {}) {
  const C = resolveColors(brand), captions = (brand.style || {}).captions || 'outline', out = []
  const pair = (what, fg, bg, min) => { if (isHex(C[fg]) && isHex(C[bg])) out.push({ what, fg: C[fg], bg: C[bg], ratio: contrast(C[fg], C[bg]), min }) }
  pair('text on the background', 'text', 'bg', 4.5); pair('text on a panel', 'text', 'panel', 4.5); pair('text on a lit panel', 'text', 'panel2', 4.5)
  pair('soft text on the background', 'soft', 'bg', 3); pair('soft text on a panel', 'soft', 'panel', 3)
  pair('muted text on a panel', 'mute', 'panel', 2.5)
  pair('accent on the background', 'accent', 'bg', 3); pair('accent on a panel', 'accent', 'panel', 3)
  pair('button text on the accent colour', 'onAccent', 'accent', 3); pair('button text on the good colour', 'onGood', 'good', 3)
  pair('problem tag text', 'badHi', 'bg', 3); pair('fix tag text', 'goodHi', 'bg', 3)
  pair('problem colour on a panel', 'bad', 'panel', 2.5); pair('good colour on a panel', 'good', 'panel', 2.5)
  if (captions === 'box') { pair('caption text on its box', 'capText', 'capBg', 4.5); pair('highlighted caption word on its box', 'capKey', 'capBg', 3) }
  else { pair('caption text against its outline', 'capText', 'capStroke', 4.5); pair('highlighted caption word against its outline', 'capKey', 'capStroke', 3) }
  return out
}
