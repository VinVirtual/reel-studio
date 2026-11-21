# reel-studio

Short voiced motion-graphics videos made from a text script, entirely on your own machine.

You write two small JSON files: a **script** (a list of scenes, each with a line to say and what to show) and a **brand** (colours, fonts, voice). reel-studio speaks the lines with a local text-to-speech model, draws every frame in a headless browser, and encodes an MP4 with word-by-word captions, music and sound effects. Nothing is uploaded and no paid service is used.

It is packaged as a [Claude Code](https://claude.com/claude-code) skill (`SKILL.md` tells the assistant how to use it), and it also works by hand from the command line.

## What it makes

- Vertical (1080×1920), square (1080×1080) and landscape (1920×1080) video at 30 fps, plus an `embed` format with larger type for video shown small inside a web page.
- Scene types: title, bullets, chat thread, card, big number, two-column compare, quote, image, call to action, numbered steps, box-and-arrow diagram, bar chart, and your own custom scenes in JavaScript.
- Elements appear on the word that names them (`"at": "word"`).
- Captions burned in (optional) and as `.vtt` and `.srt` files.
- A web copy: a small 720p faststart MP4 and a poster JPEG.
- A batch build for many scripts that share one brand.

## Limits

- It makes **motion graphics from a script**. It is **not a generative video model**: it does not create footage, people, photos or illustrations. Pictures come from files you supply (screenshots, photos).
- The voice is Kokoro. It covers American and British English, Spanish, French, Hindi, Italian, Japanese, Brazilian Portuguese and Mandarin Chinese, with a fixed set of voices. It does not clone voices.
- Word timings are estimated from syllable counts inside each phrase, not measured from the audio, so a highlight can be a fraction of a second early or late in long phrases.
- The music is a simple generated beat. For anything else, use the `-voiceonly.mp4` and add music in your editor.
- Layout is automatic and has limits. `reel lint` and the review sheet show what does not fit; long text has to be shortened.
- Tested on Linux with Chrome. macOS is supported by the scripts but has not been tested by the author. Windows is untested.

## Requirements

| Needed | Why | Licence |
|---|---|---|
| Node.js 18 or newer | runs the renderer | MIT |
| [playwright-core](https://www.npmjs.com/package/playwright-core) | drives the browser | Apache-2.0 |
| Google Chrome, Chromium or Playwright's own Chromium | draws the frames | Chrome: proprietary freeware. Chromium: BSD-style and others |
| Python 3.10 to 3.13 | runs the voice step | PSF |
| [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | text to speech | MIT |
| Kokoro v1.0 model files (`kokoro-v1.0.onnx`, `voices-v1.0.bin`, about 340 MB) | the voice model | Apache-2.0 (see the note below) |
| phonemizer and espeak-ng (installed with kokoro-onnx) | turn text into phonemes | GPL-3.0-or-later |
| onnxruntime, numpy, soundfile (installed with kokoro-onnx or beside it) | run the model, write audio | MIT, BSD-3-Clause, BSD-3-Clause |
| ffmpeg with libx264 and AAC | encodes the video | LGPL or GPL, depending on the build. The binary from `imageio-ffmpeg` is a GPL build |

None of these is included in this repository. You install them yourself, and their licences apply to your use of them.

About 1 GB of disk space and 4 GB of free memory are enough. No GPU is needed.

### Licence notes

Checked on 21 November 2026. Check again before you rely on them.

- **Bundled fonts** (`assets/fonts/`): Fraunces (Copyright 2020 The Fraunces Project Authors) and Geist (Copyright 2024 The Geist Project Authors) are both under the **SIL Open Font License 1.1**, as stated in the licence field inside each font file. The OFL allows bundling and redistribution, including in commercial work, provided the copyright and licence notice travel with the fonts and the fonts are not sold on their own. `assets/fonts/OFL.txt` carries the notices.
- **kokoro-onnx** is MIT (its `LICENSE` file). Its README says the Kokoro model is Apache-2.0.
- **Kokoro-82M** (the model, by hexgrad) is tagged Apache-2.0 on its Hugging Face model card. The model card does not give a separate licence for the individual voice files, and neither does the kokoro-onnx release page for `voices-v1.0.bin`. This could not be verified beyond the model's own Apache-2.0 tag.
- **phonemizer** (GPL-3.0-or-later, from its package metadata) and **espeak-ng** (GPL-3.0-or-later, from its README) are loaded by kokoro-onnx inside the Python process that runs `engine/gen_audio.py`. If you redistribute a bundle that includes them, or build a product on top, read the GPL's terms. This is not legal advice.
- **ffmpeg** is run as a separate program. Its licence depends on how your copy was built.
- **Videos you make** are yours. Check the licence of any fonts, images and logos you add to a project.

reel-studio's own code is under the **MIT License** (see `LICENSE`). The bundled fonts keep their own licence, as above.

## Install

```bash
# 1. the skill itself (for Claude Code; any folder works if you only use the command line)
git clone https://github.com/VinVirtual/reel-studio ~/.claude/skills/reel-studio

# 2. voice: a Python venv with Kokoro, and the two model files
python3 -m venv ~/kokoro/.venv
~/kokoro/.venv/bin/pip install kokoro-onnx soundfile numpy imageio-ffmpeg
curl -L -o ~/kokoro/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
curl -L -o ~/kokoro/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin

# 3. renderer: Playwright, and a browser if you have no Chrome
npm i -g playwright-core
npx playwright-core install chromium     # optional when Google Chrome is installed; a good fallback either way

# 4. check
~/.claude/skills/reel-studio/reel check
```

`imageio-ffmpeg` brings its own ffmpeg binary. Leave it out if you already have ffmpeg on your PATH.

Everything is found in default places that you can change with environment variables:

| Variable | Default | What |
|---|---|---|
| `KOKORO_HOME` | `~/kokoro` | folder with the model files and the `.venv` |
| `KOKORO_MODEL`, `KOKORO_VOICES` | `$KOKORO_HOME/kokoro-v1.0.onnx`, `$KOKORO_HOME/voices-v1.0.bin` | the two model files |
| `REEL_PYTHON` | `$KOKORO_HOME/.venv/bin/python`, else `python3` | Python that has kokoro-onnx |
| `FF` | `ffmpeg` on PATH, else the one from imageio-ffmpeg | ffmpeg binary |
| `PLAYWRIGHT_CORE` | found through node and `npm root -g` | folder of playwright-core |
| `REEL_CHROME` | installed Chrome, then other browsers found, then Playwright's Chromium | browser binary to try first |

## Quick start

```bash
R=~/.claude/skills/reel-studio
$R/reel new my-video            # brand.json, script.json (an example that shows the scene types), custom.js, fonts/
$R/reel lint my-video           # check the script and the layout
$R/reel audio my-video          # voice, timings, captions files
$R/reel sheet my-video          # stills/script-sheet.png: one frame per scene. Look at it.
$R/reel video my-video --web    # out/script.mp4, plus out/web/script.mp4 and a poster
```

Edit `my-video/script.json` and `my-video/brand.json`, then run the steps again. `references/scenes.md` lists every scene type and field, and `SKILL.md` has the writing rules.

### A finished example

`examples/demo/` holds the script and brand file of a 27-second landscape video about reel-studio itself. To render it:

```bash
$R/reel new demo && cp $R/examples/demo/*.json demo/
$R/reel audio demo && $R/reel video demo --web
```

## Commands

| Command | What it does |
|---|---|
| `reel check` | checks Python, Kokoro, ffmpeg, node, Playwright and that a browser really starts |
| `reel new <dir>` | starts a project from the templates |
| `reel lint <project> [script]` | reports words in `at`/`keys` that are never spoken, text over the length guide, missing files, unknown types and fields, and content that overflows or overlaps (measured in the real engine). `--no-browser` skips the layout part, `--strict` fails on warnings, `--json` prints JSON |
| `reel audio <project> [script]` | voice, word timings, music and SFX mix, `.vtt` and `.srt` |
| `reel sheet <project> [script]` | one frame per scene in a single PNG |
| `reel stills <project> [script] 1.5 4` | frames at those seconds |
| `reel video <project> [script]` | `out/<script>.mp4`, `-voiceonly.mp4`, `.vtt`, `.srt`. `--web` adds the web copy |
| `reel web <project> [script]` | `out/web/<script>.mp4` (720p, CRF 27, mono 64k AAC, faststart), `<script>.jpg` poster without captions, `<script>.vtt` |
| `reel captions <project> [script]` | only the `.vtt` and `.srt` |
| `reel build <project> [scripts...]` | voice + video for many scripts. `--jobs N` at a time, `--web`, `--force`. Skips unchanged scripts, continues after a failure, exits non-zero with a summary |
| `reel test` | runs the unit tests (plain `node --test`, no extra packages) |

`script` defaults to `script`. Options: `--no-captions`, `--workers N`, `--lossless`, `--quality 0.95`, `--web-size 720`, `--web-crf 27`, `--web-dir <dir>`, `--poster-at <seconds>`.

## How it works

1. `engine/gen_audio.py` speaks each phrase with Kokoro, spreads word times across the phrase, and writes a timeline (`build/<script>.timeline.json`) and two audio mixes.
2. `engine/engine.js` and the scene files draw a frame for any time `t` on a canvas. A frame depends only on `t`, so frames can be drawn in any order, in several browser pages at once, and every render of the same inputs gives the same video.
3. `engine/lib/video.mjs` collects the frames and pipes them to ffmpeg.

## Development

```bash
./reel test                      # unit tests for layout maths, lint rules, captions, build planning, browser launch retries
./reel lint  <project>           # layout checks run in the real engine
./reel sheet <project>           # then look at the PNG
```

Scene types live in `engine/scenes.js` and `engine/scenes-explain.js`. Layout maths that can be tested without a browser lives in `engine/fit.js`.
