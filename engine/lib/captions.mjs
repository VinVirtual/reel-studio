// Caption files (.vtt and .srt) from a timeline. Pure: no file access.

const pad = (n, w = 2) => String(n).padStart(w, '0')
/** seconds -> "HH:MM:SS.mmm" (WebVTT) or "HH:MM:SS,mmm" (SRT) */
export function stamp(sec, sep = '.') {
  const ms = Math.max(0, Math.round(sec * 1000))
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`
}

/** One cue per caption chunk: it starts at its first word and ends when the next chunk starts,
    or shortly after the scene's voice ends, whichever is first. Returns [{ start, end, text }]. */
export function cues(timeline, { linger = 0.35, minLength = 0.3 } = {}) {
  const flat = timeline.scenes.flatMap((s) => (s.chunks || []).filter((c) => c.words && c.words.length).map((c) => ({ c, voiceEnd: s.start + s.voice })))
  return flat.map(({ c, voiceEnd }, i) => {
    const start = c.words[0].t, next = flat[i + 1] ? flat[i + 1].c.words[0].t : Infinity
    const end = Math.min(next, Math.max(voiceEnd + linger, start + minLength), timeline.total ?? Infinity)
    return { start, end: Math.max(end, Math.min(next, start + minLength)), text: c.words.map((w) => w.w).join(' ') }
  })
}

export function toVtt(timeline, opts) {
  return 'WEBVTT\n\n' + cues(timeline, opts).map((q, i) => `${i + 1}\n${stamp(q.start)} --> ${stamp(q.end)}\n${q.text}\n`).join('\n')
}

export function toSrt(timeline, opts) {
  return cues(timeline, opts).map((q, i) => `${i + 1}\n${stamp(q.start, ',')} --> ${stamp(q.end, ',')}\n${q.text}\n`).join('\n')
}
