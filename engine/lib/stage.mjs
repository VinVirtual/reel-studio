// The stage: one or more browser pages with the engine loaded and a timeline set up, ready to draw frames.
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { ENGINE, launchBrowser } from './env.mjs'
import { setupArgs } from './project.mjs'

/** Open `pages` pages on one browser. Returns { browser, pages, size, close }.
    Messages from the page (errors, missing images) go to `log` once each. */
export async function openStage({ P, brand, timeline, opts = {}, pages = 1, log = console.error }) {
  const said = new Set(), once = (m) => { if (!said.has(m)) { said.add(m); log(m) } }
  const { browser, label } = await launchBrowser({ log })
  try {
    const args = setupArgs(P, brand, timeline, opts, once), list = []
    let size = null
    for (let i = 0; i < pages; i++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await context.newPage()
      page.on('pageerror', (e) => once('pageerror ' + e.message))
      page.on('console', (m) => m.type() === 'error' && once('console ' + m.text()))
      await page.goto(pathToFileURL(join(ENGINE, 'render.html')).href)
      size = await page.evaluate((a) => window.setup(a), args)
      list.push(page)
    }
    for (const id of size.missingCustom || []) once(`scene "${id}": custom.js has no function for it`)
    return { browser, label, pages: list, size, messages: said, close: () => browser.close().catch(() => {}) }
  } catch (e) { await browser.close().catch(() => {}); throw e }
}

/** one frame as an image buffer. type: 'png' (lossless) or 'jpeg' */
export async function grab(page, t, type = 'png', quality = 0.95) {
  const b64 = await page.evaluate(({ t, type, quality }) => { window.renderAt(t); return document.getElementById('c').toDataURL('image/' + type, quality).split(',')[1] }, { t, type, quality })
  return Buffer.from(b64, 'base64')
}

/** when a scene is fully built: after its last word, just before it starts to leave (the same moment lint measures) */
export const settledTime = (s, last = false) => (last ? s.start + s.voice + 0.6 : Math.max(s.start + s.voice * 0.85 + 0.2, s.end - 0.3))
