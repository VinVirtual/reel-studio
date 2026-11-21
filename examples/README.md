# Examples

Five finished scripts. Each folder is a complete project: `script.json` and `brand.json` are all that the video is made from. The four with a preview also hold the rendered web copy (`<name>.mp4`, 720p), its poster (`poster.jpg`) and a short looping preview (`preview.gif`).

| Folder | What it is | Shape | Theme | Scene types to look at |
|---|---|---|---|---|
| [`promo`](promo/) | Promo for Leafwink, an invented plant-care app | vertical 1080×1920 | pastel | chat, card, steps, compare |
| [`explainer`](explainer/) | How a domain name becomes an address (DNS) | landscape 1920×1080, `density` 1.25 | paper | compare (neutral), diagram, steps with notes, bullets |
| [`devtool`](devtool/) | Clip for mothball, an invented command-line tool | square 1080×1080 | terminal | code (terminal and editor), steps with a loop |
| [`datastory`](datastory/) | A week of working hours, charted | embed (1920×1080, larger type) | poster | bars (both directions), stat, timeline |
| [`demo`](demo/) | reel-studio describing itself | landscape 1920×1080 | its own colours | steps, diagram, bullets, stat |

## About the content

Nothing here is real. Leafwink, mothball, Plain Notes and Chartroom are invented names, and the addresses end in `.example`, which can never be registered. Every number in `datastory` and in the terminal output of `devtool` is made up, and the frames that show them say so ("EXAMPLE DATA", "EXAMPLE OUTPUT", "Made-up numbers for this demo"). In `explainer`, `192.0.2.1` is an address reserved for documentation.

## Render one again

From the repository root, with the machine set up as the main README describes (`./reel check`):

```bash
./reel lint  examples/promo           # check the script and the layout
./reel audio examples/promo           # voice and word timings
./reel sheet examples/promo           # one frame per scene, in examples/promo/stills/. Look at it.
./reel video examples/promo --web     # examples/promo/out/script.mp4 and the web copy in out/web/
```

The same four commands work for `explainer`, `devtool`, `datastory` and `demo`. The `build/`, `out/` and `stills/` folders they create are ignored by git. Fonts come from `assets/fonts/`, so the folders need none of their own.

The files kept here were made from the web copy:

```bash
cp examples/promo/out/web/script.mp4 examples/promo/promo.mp4
cp examples/promo/out/web/script.jpg examples/promo/poster.jpg
```

and the previews with ffmpeg, from the full-size video (start, length and width differ per example):

```bash
ffmpeg -ss 7.95 -t 6.6 -i examples/promo/out/script.mp4 -loop 0 examples/promo/preview.gif -vf \
  "fps=12,scale=270:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
```

| Example | Start (s) | Length (s) | Width (px) |
|---|---|---|---|
| promo | 7.95 | 6.6 | 270 |
| explainer | 13.55 | 7.2 | 480 |
| devtool | 8.85 | 6.6 | 360 |
| datastory | 3.65 | 7.2 | 480 |

## Another shape, another look

```bash
./reel video examples/promo --format square     # out/script-square.mp4; brand.json is not touched
./reel lint  examples/devtool --format vertical # check a shape before rendering it
./reel themes                                   # the ready-made looks
```

To try a script in another theme, copy the folder, replace its `brand.json` with a file from `themes/`, set `name` and `wordmark`, then run lint and the sheet again. Different fonts change how text wraps.

`examples/explainer/brand.json` and `examples/datastory/brand.json` set `layout.capBase` by hand. On those two the boxed captions sat too close to the address on the closing card, so the explainer's moved up and the data story's moved down a little. A hand-set `layout` is dropped when you use `--format`.
