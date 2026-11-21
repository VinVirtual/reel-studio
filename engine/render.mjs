// Kept for scripts written against the first version of reel-studio:
//   node render.mjs <project> stills|sheet|video [script] [times...]
// It forwards to cli.mjs, which takes the command first: node cli.mjs video <project> [script].
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const [project, mode = 'sheet', ...rest] = process.argv.slice(2)
if (!project) { process.stderr.write('usage: node render.mjs <project> stills|sheet|video [script] [times...]\n'); process.exit(1) }
const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs'), mode, project, ...rest], { stdio: 'inherit' })
process.exit(r.status ?? 1)
