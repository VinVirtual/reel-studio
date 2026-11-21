// A timeline estimated from the script alone (no voice yet), so lint can lay scenes out in the real
// engine before any audio exists. Word times are spread by syllable count at a typical speaking rate.
// The phrase and caption grouping mirrors gen_audio.py.

const SYLLABLES_PER_SECOND = 4.6

export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 1
  return Math.max(1, (w.match(/[aeiouy]+/g) || []).length - (w.endsWith('e') && w.length > 3 ? 1 : 0))
}

export function splitPhrases(words) {
  const out = []; let cur = []
  for (const w of words) { cur.push(w); if (/[,.?:!]$/.test(w)) { out.push(cur); cur = [] } }
  if (cur.length) out.push(cur)
  return out
}

/** split at punctuation, long phrases into balanced groups, never leave a one-word orphan */
export function captionGroups(words, maxWords = 4) {
  const groups = []
  for (const p of splitPhrases(words)) {
    const n = Math.ceil(p.length / maxWords), size = Math.ceil(p.length / n)
    for (let i = 0; i < p.length; i += size) groups.push(p.slice(i, i + size))
  }
  const out = []
  for (const g of groups) {
    const last = out[out.length - 1]
    if (last && (g.length === 1 || last.length === 1) && last.length + g.length <= maxWords + 1) out[out.length - 1] = [...last, ...g]
    else out.push(g)
  }
  return out
}

/** same shape as build/<script>.timeline.json, with estimated times */
export function estimateTimeline(script, name = 'script') {
  let t = script.lead ?? 0.3
  const list = Array.isArray(script.scenes) ? script.scenes : []
  const scenes = list.map((sc, si) => {
    const words = String(sc.say || '').split(/\s+/).filter(Boolean), keys = new Set(sc.keys || [])
    const speed = sc.speed || script.speed || 1
    let pos = 0
    const times = words.map((w) => { const at = pos; pos += syllables(w) / SYLLABLES_PER_SECOND / speed + (/[.?!]$/.test(w) ? 0.26 : /[,:]$/.test(w) ? 0.12 : 0); return at })
    const voice = Math.max(0.4, pos)
    let wi = 0
    const chunks = captionGroups(words, script.caption_words ?? 4).map((g) => ({ words: g.map((w) => ({ w, t: +(t + times[wi++]).toFixed(3), key: keys.has(w) })) }))
    const last = si === list.length - 1
    const length = voice + (sc.hold ?? script.pause ?? 0.45) + (last ? script.tail ?? 2.6 : 0)
    const { say, keys: _keys, ...data } = sc
    const scene = { ...data, start: +t.toFixed(3), voice: +voice.toFixed(3), end: +(t + length).toFixed(3), chunks }
    t += length
    return scene
  })
  return { total: +t.toFixed(3), fps: script.fps || 30, name, estimated: true, ...(script.captions === false ? { captions: false } : {}), scenes }
}
