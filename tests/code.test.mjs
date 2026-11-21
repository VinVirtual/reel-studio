// The code and timeline scene types: the parts that need no browser (tokeniser, typing, fitting, lint rules).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../engine/fit.js'
import { lintScript, atWords, SCENE_FIELDS, CODE_LIMITS } from '../engine/lib/lintrules.mjs'

const { codeTokens, codeLines, codeHighlight, fitCode, typedChars } = globalThis.ReelFit
const kinds = (line, lang) => codeTokens(line, lang).map((t) => `${t.k}:${t.t}`)
const lint = (sc) => lintScript({ scenes: [{ id: 's', say: 'Install it, then run the build.', ...sc }] })
const rules = (issues) => issues.map((i) => `${i.level}:${i.rule}`)

test('tokens join back into the line exactly', () => {
  for (const line of ['const total = items.map((i) => i.price * 2) // sum', '  if (ok) { return "yes" }', '$ npm install --save thing', '', 'x = "unclosed', 'url: https://example.com/a#b'])
    for (const lang of ['', 'js', 'bash', 'text']) assert.equal(codeTokens(line, lang).map((t) => t.t).join(''), line)
})

test('keywords, strings, numbers and comments are told apart', () => {
  assert.deepEqual(kinds('const n = 42 // answer', 'js'), ['keyword:const ', 'text:n ', 'punct:= ', 'number:42 ', 'comment:// answer'])
  assert.deepEqual(kinds('return "a // b"', 'js'), ['keyword:return ', 'string:"a // b"'])
  assert.deepEqual(kinds("print('it\\'s')", 'python'), ['text:print', 'punct:(', "string:'it\\'s'", 'punct:)'])
})

test('a comment marker depends on the language', () => {
  assert.equal(codeTokens('# install', 'bash')[0].k, 'comment')
  assert.equal(codeTokens('# heading', 'js')[0].k, 'punct')
  assert.equal(codeTokens('a = b // 2', 'python').some((t) => t.k === 'comment'), false, 'floor division in Python')
  assert.equal(codeTokens('select 1 -- one', 'sql').at(-1).k, 'comment')
  assert.equal(codeTokens('curl https://example.com', '').some((t) => t.k === 'comment'), false, 'a URL is not a comment')
  assert.equal(codeTokens('echo a#b', 'bash').some((t) => t.k === 'comment'), false, '# inside a word')
})

test('lang "text" switches the colouring off', () => {
  assert.deepEqual(codeTokens('const x = 1', 'text'), [{ t: 'const x = 1', k: 'text' }]); assert.deepEqual(codeTokens('', 'text'), [])
})

test('codeLines takes a list of strings or objects, or one string', () => {
  assert.deepEqual(codeLines({ lines: ['a', { text: 'b', at: 'run', tone: 'fix' }] }), [{ text: 'a', cmd: false }, { text: 'b', at: 'run', tone: 'fix', cmd: false }])
  assert.deepEqual(codeLines({ code: 'one\n\ttwo\n' }).map((l) => l.text), ['one', '  two'])
  assert.deepEqual(codeLines({}), [])
})

test('in a terminal, lines that start with the prompt are commands', () => {
  assert.deepEqual(codeLines({ variant: 'terminal', lines: ['$ ls', 'file.txt'] }).map((l) => l.cmd), [true, false])
  assert.deepEqual(codeLines({ variant: 'terminal', prompt: '>', lines: ['> ls', '$ ls'] }).map((l) => l.cmd), [true, false])
  assert.deepEqual(codeLines({ lines: ['$ ls'] }).map((l) => l.cmd), [false], 'an editor has no commands')
})

test('highlight accepts a line, a list or an object, counted from 1', () => {
  assert.deepEqual(codeHighlight(2, 3), { lines: [1], at: null })
  assert.deepEqual(codeHighlight([1, 3, 3, 9, 0], 3), { lines: [0, 2], at: null })
  assert.deepEqual(codeHighlight({ line: 3, at: 'here' }, 3), { lines: [2], at: 'here' })
  assert.deepEqual(codeHighlight({ lines: [1, 2] }, 3).lines, [0, 1])
  assert.deepEqual(codeHighlight(undefined, 3), { lines: [], at: null })
})

test('code shrinks until the longest line and all the rows fit', () => {
  assert.equal(fitCode({ cols: 20, rows: 3, width: 900, height: 500, size: 32 }).size, 32, 'never larger than asked')
  const wide = fitCode({ cols: 60, rows: 3, width: 720, height: 500, charW: 0.6 })
  assert.equal(wide.size, 20); assert.ok(60 * 0.6 * wide.size <= 720); assert.ok(wide.fits)
  const tall = fitCode({ cols: 10, rows: 20, width: 900, height: 450 })
  assert.equal(tall.size, 15); assert.ok(20 * 1.5 * tall.size <= 450)
  const tooMuch = fitCode({ cols: 200, rows: 3, width: 700, height: 500, min: 14 })
  assert.equal(tooMuch.size, 14); assert.equal(tooMuch.fits, false)
})

test('typing: nothing before the start, everything by the deadline, and steady in between', () => {
  assert.equal(typedChars(20, 0.9, 1), 0)
  assert.equal(typedChars(20, 1.25, 1, 40), 10)
  assert.equal(typedChars(20, 1.5, 1, 40), 20); assert.equal(typedChars(20, 9, 1, 40), 20)
  assert.equal(typedChars(80, 1.5, 1, 40, 1.5), 80, 'done when the next line starts')
  assert.equal(typedChars(80, 1.06, 1, 40, 1.01), 40, 'but never in under 0.12 s')
  assert.equal(typedChars(0, 5, 1), 0)
  let last = 0
  for (let t = 1; t < 1.6; t += 0.01) { const n = typedChars(24, t, 1); assert.ok(n >= last); last = n }
})

test('lint knows the code and timeline types and their fields', () => {
  assert.ok(SCENE_FIELDS.code.includes('highlight')); assert.ok(SCENE_FIELDS.timeline.includes('items'))
  assert.deepEqual(lint({ type: 'code', file: 'run.sh', lang: 'bash', variant: 'terminal', mode: 'type', lines: [{ text: '$ npm install', at: 'install' }, { text: '$ npm run build', at: 'build' }], highlight: { line: 2, at: 'run' } }), [])
  assert.deepEqual(lint({ type: 'timeline', items: [{ date: 'Step 1', text: 'Install it', at: 'install' }, { date: 'Step 2', text: 'Build', at: 'build' }] }), [])
  assert.deepEqual(rules(lint({ type: 'code', code: 'a\nb', colour: 'red' })), ['warn:field'])
})

test('lint: a code scene needs lines, valid values and a highlight inside the block', () => {
  assert.deepEqual(rules(lint({ type: 'code' })), ['error:value'])
  assert.deepEqual(rules(lint({ type: 'code', lines: ['a'], variant: 'ide', mode: 'fast' })), ['error:value', 'error:value'])
  const out = lint({ type: 'code', lines: ['a', 'b'], highlight: [2, 3] })
  assert.deepEqual(rules(out), ['error:value']); assert.match(out[0].message, /highlight: 3 is not a line number from 1 to 2/)
  assert.deepEqual(rules(lint({ type: 'code', lines: ['a'], code: 'a' })), ['warn:value'])
})

test('lint: words that time a line or the highlight must be spoken', () => {
  assert.deepEqual(atWords({ lines: ['x', { text: 'y', at: 'a' }], highlight: { line: 1, at: 'b' } }).map((w) => w.where), ['lines[1].at', 'highlight.at'])
  assert.deepEqual(atWords({ highlight: [1, 2] }), [])
  assert.deepEqual(rules(lint({ type: 'code', lines: [{ text: 'a', at: 'deploy' }], highlight: { line: 1, at: 'never' } })), ['error:at', 'error:at'])
})

test('lint: long code is a warning, not an error', () => {
  const many = lint({ type: 'code', lines: Array.from({ length: CODE_LIMITS.lines + 1 }, (_, i) => `line ${i}`) })
  assert.deepEqual(rules(many), ['warn:length'])
  assert.deepEqual(rules(lint({ type: 'code', lines: ['x'.repeat(CODE_LIMITS.chars + 1)] })), ['warn:length'])
})

test('lint: a timeline needs items, and its text follows the word guide', () => {
  assert.deepEqual(rules(lint({ type: 'timeline' })), ['error:value'])
  assert.deepEqual(rules(lint({ type: 'timeline', items: ['A'], direction: 'diagonal' })), ['error:value'])
  assert.deepEqual(rules(lint({ type: 'timeline', items: [{ date: 'A very long date label', text: 'This milestone text is far too long' }] })), ['warn:length', 'warn:length'])
})
