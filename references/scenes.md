# Scene types

Every scene needs `id`, `type` and `say`. Common optional fields:

| field | effect |
|---|---|
| `keys` | caption words to highlight (exact words from `say`, punctuation included) |
| `tone` | `problem` (red), `fix` (green and accent), `neutral` |
| `tag` | small pill above the headline, e.g. `"HEADACHE 1 OF 4"`, `"THE FIX"` |
| `title` | headline (use `\n` to force a break); `titleSize` overrides the size |
| `step` | progress-bar segment number (bar shows only when some scenes have `step`) |
| `stamp` | `{"label": "NO REPLY", "at": "word", "tone": "problem"}` slams a stamp over the body |
| `hold`, `sfx`, `voice`, `speed` | timing and audio overrides |

`at: "word"` (on items, rows, chips, steps, nodes, edges, bars, code lines, milestones) makes an element appear when that word is spoken. It matches the first spoken word equal to it (case and punctuation ignored), and otherwise the first word that starts with it. Without `at`, items stagger across the voice-over. Items can be plain strings or `{"text", "at", "icon"}` objects.

Scenes that hold a block of content (bullets, compare, steps, chat, card, quote, code, timeline) shrink it to fit the body area. `reel lint` reports anything that still overflows.

## title
Big statement. Use it for the hook, a chapter card or an outro.
`kicker` (pill above), `title` (last line drawn in the accent colour), `sub`, `chips` (up to 6 floating pills around it, each a string or `{"text", "at", "tone"}`).

## bullets
A panel holding a list. Icons default to cross for `problem`, check for `fix`, and numbers otherwise. Set `icon` on the scene or on an item to override: `check` | `cross` | `dot` | a number.
`items`, `rowH`.
Rows fit the body by themselves: they are packed closer first, and the text is made smaller only when that is not enough. `rowH` fixes the row height by hand and switches the fitting off.

## chat
A message thread. Good for "they never reply" or "customer asks" moments.
`contact`, `avatar` (initials), `presence`, `items: [{from: "me"|"them", text, at, status: "Seen 2 days ago"}]`, `typing: true` (or `{"at": "word"}`) shows typing dots after the last message.

## card
A profile, booking or product card.
`avatar`, `name`, `meta`, `badge` (+`badgeAt`), `rating`, `rows: [{label, value, at, color}]`, `button` (+`buttonAt`, which plays a press animation on that word), `status: {label, at, tone}` (stamps over the card).

## stat
One big number.
`value: "0"`, or `count: {from, to, prefix, suffix, decimals, at, dur}` to count up. Also `label`, `note`. Uses the bad colour when `tone: "problem"`.

## compare
Two columns. The right column comes in about halfway through the line.
`left: {label, items}`, `right: {label, items}`, `variant`.
- Default: left is "before" (crosses, red), right is "after" (checks, green).
- `"variant": "neutral"`: both columns look the same (accent colour, dots). Use it for plain side-by-side content where neither side is the bad one.
- A side can set its own look with `tone` (`problem` | `fix` | `neutral`) or `icon` (`check` | `cross` | `dot` | a number), for example `"right": {"label": "Good", "tone": "fix", "items": [...]}`.

## steps
A numbered flow with arrows. Every step is on screen from the start, dimmed. Each one lights up when its word is spoken, and the arrow runs to it.
`items: [{text, at, note}]` (or plain strings), `direction`, `loop`, `loopAt`.
- `direction`: `row` (boxes side by side, the default for up to 5 steps on square and landscape frames) or `column` (one row per step, the default on vertical frames).
- `loop: true` draws an arrow from the last step back to the first, for cycles such as "sense, think, act". `loopAt` is the word that starts it.
- `note` is a small second line under a step.
- `tone` on the scene sets the colour of the lit steps.
```json
{"id": "loop", "type": "steps", "tag": "ONE LOOP", "title": "Sense, think, act", "loop": true,
 "items": [{"text": "Sense", "at": "sense"}, {"text": "Think", "at": "think"}, {"text": "Act", "at": "act"}],
 "say": "A robot will sense, think and act, then go round again."}
```

## diagram
Boxes and arrows from a list of nodes and edges.
`nodes: [{id, label, sub, at, tone, col, row}]`, `edges: [{from, to, label, at, dashed, tone}]`, `direction`.
- `direction`: `right` (the default on landscape and square frames) or `down` (the default on vertical frames).
- Layout is automatic: a node sits one step after the nodes that point to it, and nodes in the same step stack. Set `col` and `row` (0-based) on a node to place it by hand.
- A node appears at its `at` word (or in turn). An arrow draws itself as the node it points to appears, or at its own `at` word.
- An edge that points back to an earlier node runs around the outside of the diagram, so a feedback loop stays readable. `dashed: true` draws a dashed line.
- `sub` is a small second line in a box. `tone` (`fix` | `problem` | `mute`) colours a box or an arrow.
- Keep it to about 6 nodes, with labels of one or two words. Edge labels need room between boxes: use one short word.
```json
{"id": "parts", "type": "diagram", "tag": "THE PARTS", "title": "What feeds what",
 "nodes": [{"id": "script", "label": "Script"}, {"id": "voice", "label": "Voice"}, {"id": "video", "label": "Video", "tone": "fix"}],
 "edges": [{"from": "script", "to": "voice"}, {"from": "voice", "to": "video"}],
 "say": "The script feeds the voice, and the voice feeds the video."}
```

## bars
A bar chart that grows. Labels are on screen from the start. Each bar grows, and its number counts up, when its word is spoken.
`bars: [{label, value, at, tone, display}]`, `prefix`, `suffix`, `decimals`, `max`, `direction`, `note`.
- `direction`: `horizontal` (the default, best for labels of more than one word) or `vertical`.
- `value` is a number of 0 or more. `prefix`, `suffix` and `decimals` format it (`"suffix": "%"`). `display` replaces the number shown once a bar has finished growing (for example `"1.2 M"`).
- `max` sets the value of a full-length bar. Without it the largest bar is full length.
- `tone` on a bar: `fix` (green), `problem` (red), `mute` (grey). Others use the accent colour.
- `note` is a small line under the chart. Use it for the source of the numbers, or to say that they are an example.
- Only chart real numbers, or label the chart clearly as an example.
```json
{"id": "chart", "type": "bars", "tag": "EXAMPLE DATA", "title": "A chart that grows", "suffix": "%",
 "bars": [{"label": "Option A", "value": 24, "at": "A"}, {"label": "Option B", "value": 41, "at": "B"}],
 "note": "Placeholder numbers", "say": "Option A, then option B."}
```

## code
A code editor or a terminal window whose lines type themselves in.
`lines: ["text", {text, at, tone}]` (or `code`, one string with line breaks), `file`, `lang`, `variant`, `mode`, `highlight`, `numbers`, `prompt`, `size`.
- `variant`: `editor` (the default: line numbers and light syntax colouring) or `terminal` (no line numbers; a line that starts with the prompt, `$ ` unless you set `prompt`, is a command and types on, any other line is output and appears whole).
- A line starts at its `at` word, or the lines take turns across the voice-over. Typing finishes before the next line starts.
- `mode`: `type` (the default) or `lines` (each line appears whole).
- `highlight` marks lines with a coloured band and dims the rest: a line number (`2`), a list (`[2, 3]`), or `{"line": 2, "at": "word"}` to time it. Lines count from 1. Without `at` it comes on after the last line. The scene's `tone` sets the band colour.
- `tone` on a line colours it: `fix` (green), `problem` (red), `mute` (grey). Use it for output such as a success or an error message.
- `file` is the name in the title bar. `lang` picks the comment style for colouring (`js`, `python`, `bash`, `toml`, `sql`…); `"lang": "text"` switches colouring off. The colouring is simple: comments, strings, numbers and common keywords.
- `numbers: false` hides the line numbers. `size` is the largest font size in pixels (38 by default).
- The text shrinks until the longest line and all the rows fit. Keep to about 12 lines of 56 characters or fewer; lint warns beyond that, and reports text that still does not fit.
- The font is JetBrains Mono, or `fonts.mono` in brand.json.
- Label made-up output as an example (for instance `"tag": "EXAMPLE OUTPUT"`).
```json
{"id": "run", "type": "code", "tag": "EXAMPLE OUTPUT", "title": "One command", "variant": "terminal",
 "lines": [{"text": "$ npm test", "at": "run"}, {"text": "12 passed", "tone": "fix", "at": "pass"}],
 "highlight": {"line": 2, "at": "pass"}, "say": "Run the tests and watch them pass."}
```

## timeline
Milestones along a line, dated or just in order. The line and every label are on screen from the start, dimmed. The line runs to each milestone, and it lights up, when its word is spoken.
`items: [{date, text, note, at, tone}]` (or plain strings), `direction`.
- `date` is the short label beside the dot: a year, `"Week 2"`, `"Step 1"`. Leave it out for a plain ordered list of milestones.
- `note` is a small second line. `tone` on an item (`fix` | `problem` | `mute`) colours its dot and date; `tone` on the scene colours the line.
- `direction`: `row` (the line runs across, the default for up to 5 milestones on square and landscape frames) or `column` (the line runs down the left, the default on vertical frames).
- Keep `text` to 5 words and `date` to 3. Only use real dates and events, or label them as an example.
```json
{"id": "plan", "type": "timeline", "tag": "THE PLAN", "title": "Three weeks",
 "items": [{"date": "Week 1", "text": "Write", "at": "write"}, {"date": "Week 2", "text": "Review", "at": "review"}, {"date": "Week 3", "text": "Ship", "at": "ship"}],
 "say": "First we write, then we review, then we ship."}
```

## quote
A review or testimonial card with stars.
`text`, `author`, `meta`, `stars`. Only use real reviews, or label it clearly as an example.

## image
A real screenshot or photo (project-relative `src`, e.g. `assets/home.png`) with a slow push-in. If there's no `tag` or `title`, it takes the full height. This is the best way to show the real product. Take screenshots with Playwright at the mobile viewport (e.g. 390×844 @3x).

## cta
Closing card: the brand mark (logo or wordmark), `title`, `comment` (types itself into a comment box, e.g. `"@yourbestie"`), `button` (+`buttonAt`), `url`. The header isn't drawn on this type.

## custom
`{"type": "custom", "fn": "name", ...any fields}` calls `window.CUSTOM.name(t, s, api, A)` from `<project>/custom.js`. The header (tag and title) is drawn for you. `api` exposes:
- the canvas and sizes: `ctx`, `W`, `H`, `L` (layout), `C` (colours), `IMG`
- easing and timing: `prog(t, start, dur)`, `outCubic`, `outBack`, `io`, `lerp`, `clamp`, `rgba(hex, a)`, `wt(s, "word")`, `revealAt(s, item, i, n)`
- drawing: `panel`, `text`, `wrap`, `wrapLines`, `pill`, `icon`, `star`, `avatar`, `stamp`, `button`, `arrow`, `brandMark`, `drawImage`, `rr`, `glow`
- the brand's look: `style` (the resolved `style` block: `corners`, `shadow`, `border`, …) and `cased(title)`, which applies `titleCase`. `panel`, `rr`, `button` and `glow` already follow the style, so use them rather than drawing rounded boxes and shadows by hand
- fitting: `fitBody(height)` shrinks what you draw next so a block of that height fits the body area, and `fit` holds the layout maths (`fit.fitRows`, `fit.fitText`, `fit.layoutDiagram`)
- `TYPES`, to draw a built-in type inside a custom scene

`text(s, x, y, {size, weight, color, align, display: true for the headline font, mono: true for the code font, italic})`. Colours accept a palette key (`'accent'`, `'soft'`, `'good'`…) or a hex value. Coordinates are layout pixels (`W` × `H`), which can be fewer than the output pixels with the `embed` format or `density`. Animate only from `t`; never use timers or randomness without a seed, so frames stay deterministic. Frames are drawn in several browser pages at once and out of order, so a scene must not keep state between frames. See `templates/custom.js` for a calendar example.
