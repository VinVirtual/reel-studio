---
name: reel-studio
description: Make short branded explainer and promo videos (TikTok, Reels, Shorts, square, landscape or embedded in a web page) entirely on this machine, for free, with no paid video or voice service. A script of scenes plus a brand file becomes a voiced MP4 with animated UI mock-ups, step flows, diagrams, bar charts, code and terminal panels, timelines, word-by-word captions, music and sound effects, plus caption files and a small web copy with a poster. Use whenever the user wants a TikTok, Reel, Short, promo video, explainer video, product demo video, ad, or "a video for social media" or for a web page, for any project or brand, or wants to re-cut, re-voice or restyle a video made this way.
---

# reel-studio

Local pipeline: **Kokoro TTS** (voice) → **timeline** (word timings) → **canvas engine** in headless Chrome (each frame is a pure function of t) → **ffmpeg** (H.264 + AAC). Output is 30 fps, CRF 17, ready to post. It makes motion graphics from a script. It is not a generative video model.

Skill folder: `~/.claude/skills/reel-studio/` (written below as `$R`). Every command is `$R/reel <command> <project> [script]`. `$R/reel help` lists them.

```
$R/reel                  the command line (check, themes, new, lint, audio, sheet, stills, video, web, captions, preview, build, test)
$R/engine/gen_audio.py   voice + timings + music/SFX mix (run by `reel audio`)
$R/engine/engine.js      layout, captions, brand, drawing helpers
$R/engine/scenes*.js     the scene types
$R/themes/               ready-made brand files (ember, midnight, paper, poster, pastel, terminal)
$R/examples/             finished scripts with their rendered videos
$R/engine/lib/           rendering, lint, batch build, caption files
$R/templates/            brand.json, script.json (shows every scene type except image and custom), custom.js
$R/references/scenes.md  every scene type and its fields
$R/README.md             install, licences, limits
```

## Workflow

1. **Check the machine** with `$R/reel check`. It tells you how to fix anything missing, and whether a browser really starts.
2. **Scaffold** with `$R/reel new <dir>`. Put the project next to the user's other marketing files, not inside an app repo unless they ask.
   - `$R/reel themes` lists six ready-made looks. `$R/reel new <dir> --theme paper` starts from one, and `--format square` sets the shape. Pick the theme that suits the subject (for example `terminal` for developer tools, `paper` for calm explainers, `poster` for loud promos), then change its colours to the brand's.
3. **Brand** (`brand.json`):
   - Set colours, fonts, wordmark or `logo`, `format`, voice and pronunciations.
   - `format` is `vertical` (1080×1920) | `square` (1080×1080) | `landscape` (1920×1080) | `embed` (1920×1080 with type 1.2× larger, for a video that sits in a web page column).
   - `logo` is a project-relative PNG and should have a transparent background. Otherwise its box shows on the CTA card. Use the text `wordmark` when there's no good logo file.
   - Take colours from the product's real design tokens if a codebase exists.
   - Add brand names that the voice will mispronounce to `pronounce` (regex → spoken spelling).
4. **Script** (`script.json`):
   - Write it with the user, following the "Writing the script" rules below.
   - Pick a scene `type` for each beat from `references/scenes.md`. Write `custom.js` only when no built-in type fits.
5. **Lint**: `$R/reel lint <dir> [script]`. Fix every `error` before going on.
   - It reports `at` and `keys` words that are not in `say`, text over the length guide, missing image and font files, unknown scene types and fields, and bad values.
   - It then lays every scene out in the real engine (no voice needed) and reports content that overflows the body area, runs into the captions or off the frame, and text that overlaps.
   - It warns (`contrast`) when a text colour in brand.json is hard to read on the colour behind it.
6. **Voice**: `$R/reel audio <dir> [script]`. It prints each scene's start time and voice length, and writes `out/<script>.vtt` and `.srt`. Phrases that have not changed are reused, so a second run is quick.
7. **Review**:
   - Run `$R/reel sheet <dir> [script]`, then **Read the sheet PNG**. It shows one frame per scene, taken after the scene's last word.
   - Check for overlaps, text under captions, cut-off text, and anything outside the safe area.
   - For a closer look, run `$R/reel stills <dir> [script] 3.2 7.5`.
   - Fix the problems and re-render the sheet. Always look before rendering video.
   - For quick iteration, `$R/reel preview <dir> [script]` serves a local page that plays the video with its voice and a scrub bar, with no rendering. It reloads when the script or brand changes. A changed `say` line still needs `reel audio`. It does not replace reading the sheet.
8. **Render**: `$R/reel video <dir> [script]`. This takes about half a second of rendering per 1 s of video on a machine with 8 or more cores (frames are drawn in up to 4 browser pages at once).
   - It writes `out/<script>.mp4` (voice, SFX and music), `out/<script>-voiceonly.mp4` (voice and SFX only, for laying a trending sound over in the app), `out/<script>.vtt` and `out/<script>.srt`.
   - Add `--web` (or run `$R/reel web <dir> [script]` afterwards) for a web copy in `out/web/`: a small 720p faststart MP4 (CRF 27, mono 64k audio), a poster JPEG drawn without captions, and the `.vtt`.
9. **Verify and deliver**:
   - Check streams and length with ffmpeg (`$FF -i out.mp4 -af volumedetect -f null -`). Mean volume around −20 to −24 dB is right.
   - Send the file to the user (SendUserFile if available).
   - Include a ready-to-paste caption and hashtags, plus a list of every factual claim the video makes, for the user to confirm.

Several videos in one project: name scripts `customers.json`, `vendors.json` and so on, and pass the name to each command. They share `brand.json`. Build them all with one command:

```
$R/reel build <dir> [script ...] --jobs 3 --web
```

The same script in another shape: add `--format vertical|square|landscape|embed` to `lint`, `sheet`, `stills`, `video`, `web`, `build` or `preview`. brand.json is not changed, the files are named `<script>-<format>` (for example `out/script-square.mp4`), and the voice is shared. Lint and read the sheet for each shape: a layout that fits one shape can overflow another. Do not name a script `<other>-<format>` (such as `promo-square.json`): its files would collide with `promo --format square`, and the command refuses to run.

`build` runs voice and video (and the web copy with `--web`) for every script in the project, or only the ones named. It skips a script whose inputs have not changed (`--force` rebuilds), carries on past a failure, prints a summary, and exits non-zero if anything failed. Each script's output is in `build/<script>.build.log`.

## Writing the script

- **30–45 s, 6–10 scenes.** Each scene has one idea and one sentence or two short ones.
- **The hook comes first** (`title` type): a question or a "you know this pain" line, said within 2 s. No logo intro.
- A strong format for promos is **problem → fix pairs**:
  - Set `tone: "problem"` (red tag, thud SFX, red progress segment) or `tone: "fix"` (green tag, chime, accent headline).
  - Give both scenes of a pair the same `step` number, which drives the progress bar.
- For explainers, show the structure: `steps` for a sequence or a loop, `diagram` for what connects to what, `bars` for a few numbers, `timeline` for dated or ordered milestones, `compare` with `variant: "neutral"` for two things side by side.
- For developer videos, use `code`: a terminal (`variant: "terminal"`) for commands and their output, or an editor for a few lines of a file, with `highlight` on the line that matters. Keep it to about 12 short lines.
- `keys` are the words highlighted in the captions. Use 1–3 per scene, written exactly as they appear in `say`, including punctuation (for example `"confirms."`).
- Use `at: "word"` on items, buttons, steps, nodes, bars, code lines and milestones so things appear exactly when that word is spoken.
- **End on a CTA with an action** ("Tag a friend who…", "Comment X", "Link in bio", "Read the full note"). Put the URL on screen.
- **On-screen text is short**: headlines are 4 words or fewer (the hook and CTA title 6 or fewer), list items 5 or fewer, tags 4 or fewer, chips and diagram or bar labels 3 or fewer. The voice-over carries the detail. Lint warns when text is longer.
- **Claims:** never invent prices, stats, reviews, ratings or features. Made-up terminal output and dates count too: tag them `EXAMPLE OUTPUT` or `EXAMPLE DATA`. Use the user's real numbers, or mark mock-up data as an example on screen and tell the user. Avoid real people's or other businesses' names in mock chats and cards unless the user supplies them.

## Safe areas (vertical 1080×1920)

TikTok and Reels cover the top ~200 px (tabs), the bottom ~470 px (caption and audio bar) and the right ~120 px (like/comment rail). The vertical layout already keeps the tag, title, body (y 640–1250) and captions (baseline 1420) inside the safe area, and content stays left of x=940. Custom scenes must stay between `L.bodyTop` and `L.bodyBottom`, and inside `L.x0`–`L.x1`.

Lists, comparisons, step flows, cards, chats, quotes, code and timelines shrink to fit the body area by themselves. Lint tells you when something still does not fit.

## Voices

`brand.voice` or `script.voice` takes a Kokoro voice:
- **American English:** `af_heart` (warm, the default), `af_bella`, `af_nicole`, `af_sarah`, `am_michael`, `am_adam`, `am_onyx`
- **British English:** `bf_emma`, `bf_isabella`, `bm_george`, `bm_daniel`
- **Other languages:** Spanish (`ef_`/`em_`), French (`ff_siwis`), Hindi (`hf_`/`hm_`), Italian (`if_`/`im_`), Japanese (`jf_`/`jm_`), Portuguese (`pf_`/`pm_`), Chinese (`zf_`/`zm_`). Set `lang` to match: `es`, `fr-fr`, `hi`, `it`, `ja`, `pt-br` or `zh`.

`speed` 1.0–1.15 suits social video. Kokoro has voices only for the languages above. For a line in any other language, keep the voice-over in English and show the other language on screen, or note that a different TTS would be needed.

## Options

- `music`:
  - `{"on": false}` turns the beat off.
  - `bpm` and `chords` (for example `"C-G-Am-F"`) change the mood.
  - `volume` is 0–1 under the voice. The music ducks automatically while someone is speaking.
- `background`: `glow-dots` | `glow` | `plain` | `grid` (ruled lines) | `paper` (grain and a thin rule) | `blobs` (soft drifting colour) | `stripes` (slanted bands).
- `style` in brand.json sets the look beyond colour. Every key is optional, and a brand without `style` looks as it always did:
  - `corners`: 0 (square) to 2; 1 is the default roundness.
  - `shadow`: `soft` (default) | `faint` (for light backgrounds) | `hard` (a solid offset block) | `none`.
  - `border`: panel outline width in pixels, 0 to 12 (default 2). `borderColor`: a palette key or hex for it.
  - `glow`: `false` removes the coloured glows behind buttons, big numbers and lit steps (better on light backgrounds).
  - `motion`: `smooth` (default) | `calm` (no overshoot, slower) | `bouncy` | `snappy` (short, quick).
  - `transition`: how scenes change: `rise` (default) | `fade` | `slide` | `cut`.
  - `captions`: `outline` (default) | `box` (each line on a solid strip) | `highlight` (a block behind the word being spoken). `captionCase: "upper"`, `captionFont: "display"`.
  - `titleCase: "upper"` draws headlines in capitals.
- Extra colours a light or unusual palette may need (all optional): `onAccent` and `onGood` (text on accent and green buttons), `shadow`, `pattern` (grid and stripes), `capText`, `capKey`, `capBg`, `capStroke` (captions). On a light background `goodHi` and `badHi` must be dark, because they are used as text.
- `fonts.mono` sets the font of `code` scenes (JetBrains Mono by default). Bundled fonts: Fraunces (italic), Geist, JetBrains Mono, Anton, Instrument Serif, Fredoka.
- Captions: `"captions": false` in brand.json or in a script, or `--no-captions` on `video`, `sheet`, `stills` and `build`, hides the burned-in captions. The `.vtt` and `.srt` files are written either way, so a web player can show captions itself.
- Size on screen:
  - `"format": "embed"` for a landscape video that will be shown small, inside a page.
  - `"density": 1.2` (1 to 2) does the same for any format: the frame keeps its pixel size and everything on it is drawn that much larger.
  - `layout` in brand.json still overrides any single layout number (for example `{"bodyTop": 700}`).
- Per scene:
  - `hold` sets the seconds after the voice ends (default is `pause`).
  - `sfx` is `thud` | `chime` | `whoosh` | `none`.
  - `voice` and `speed` override the defaults.
- Web copy: `--web-size 720` (short side in pixels), `--web-crf 27`, `--web-dir <dir>`, `--poster-at <seconds>` (or `"poster": 2.2` in the script). The poster defaults to the first scene once it is fully built.
- Render: `--workers N` sets how many browser pages draw frames at once. `--lossless` sends frames as PNG instead of JPEG (about twice as slow, pixel exact).
- Paths: `KOKORO_HOME`, `REEL_PYTHON`, `FF`, `PLAYWRIGHT_CORE` and `REEL_CHROME` override where the tools are found (see `README.md`).

## Troubleshooting

- **Text overflows a card:** run `reel lint`. Shorten the copy first. Otherwise lower `titleSize` or split the scene.
- **Word timing:** `reel audio` prints where word times came from. Normally that is the voice model's own phoneme durations. If it says "estimated", it also says why (usually kokoro-onnx older than 0.6); things then appear up to a few tenths of a second early or late. `REEL_TIMING=estimate` forces the old estimate. Reading the durations makes `reel audio` peak at about 1.0 GB of memory while the model loads (about 0.56 GB with the estimate).
- **Captions unreadable on a light background:** set `style.captions` to `box` or `highlight`, and run `reel lint` for the contrast warnings.
- **A word is highlighted or timed on the wrong word:** check the `keys` and `at` spelling against `say` (lint reports words that are never spoken). `at` matches the first word equal to it, and otherwise the first word that starts with it.
- **A name is mispronounced:** add it to `pronounce`. Spell it phonetically, or use hyphens for syllables.
- **`pageerror` lines in the render output:** usually a bug in `custom.js`. The engine's own errors name the scene field involved.
- **"No browser could be started":** the message lists what was tried. Install Chrome, or Playwright's own Chromium with the command it prints, or set `REEL_CHROME`. `reel check` shows which browsers are found.
- **Changing the voice-over or timing:** re-run `reel audio`. Visual-only changes need just `reel sheet` or `reel video`. `reel build` works out which steps are needed.
- **Old commands** (`python gen_audio.py <dir>`, `node engine/render.mjs <dir> video`) still work.
