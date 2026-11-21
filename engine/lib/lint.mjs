// The lint command: script rules first, then every scene laid out in the real engine and measured.
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { SKILL } from './env.mjs'
import { loadBrand, loadScript } from './project.mjs'
import { lintScript, lintGeometry } from './lintrules.mjs'
import { estimateTimeline } from './timeline.mjs'
import { openStage } from './stage.mjs'

/** Lint one script. browser: false skips the layout checks. Returns the list of issues. */
export async function lintProject({ P, name, browser = true, opts = {} }) {
  const brand = loadBrand(P), script = loadScript(P, name)
  const issues = lintScript(script, brand, {
    exists: (rel) => existsSync(join(P, rel)),
    bundledFont: (file) => existsSync(join(SKILL, 'assets', 'fonts', basename(file))),
  })
  // layout is measured for every scene the engine can draw; scenes with a broken id, type or say are left out
  const broken = new Set(issues.filter((i) => ['script', 'type', 'id', 'say'].includes(i.rule)).map((i) => i.scene))
  const scenes = (Array.isArray(script.scenes) ? script.scenes : []).filter((sc, i) => sc && typeof sc === 'object' && !broken.has(sc.id ? String(sc.id) : `#${i + 1}`))
  if (!browser || !scenes.length) return { issues, measured: false }
  const timeline = estimateTimeline({ ...script, scenes }, name), page = []
  const stage = await openStage({ P, brand, timeline, opts, log: (m) => page.push(m) })
  try {
    for (let i = 0; i < timeline.scenes.length; i++) issues.push(...lintGeometry(await stage.pages[0].evaluate((n) => window.lintScene(n), i)))
    for (const id of stage.size.missingCustom || []) issues.push({ level: 'error', scene: id, rule: 'custom', message: `custom.js has no function "${scenes.find((sc) => sc.id === id)?.fn}" (window.CUSTOM)` })
  } finally { await stage.close() }
  for (const m of page) {
    if (/^font not found|image not found|Failed to load resource|scene ".*": custom\.js has no function/.test(m.replace(/^console /, ''))) continue // reported by the file rules or below
    issues.push({ level: 'error', scene: '-', rule: 'page', message: m })
  }
  return { issues, measured: true }
}
