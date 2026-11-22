#!/usr/bin/env bash
# Checks everything reel-studio needs and prints how to fix what is missing. Works on Linux and macOS.
# Defaults can be changed with environment variables:
#   KOKORO_HOME   folder with the Kokoro model files and (by default) the Python venv   (default ~/kokoro)
#   REEL_PYTHON   Python that has kokoro-onnx installed            (default $KOKORO_HOME/.venv/bin/python, else python3)
#   KOKORO_MODEL, KOKORO_VOICES   the two model files               (default $KOKORO_HOME/kokoro-v1.0.onnx, voices-v1.0.bin)
#   FF            ffmpeg binary                                     (default: ffmpeg on PATH, else imageio-ffmpeg's)
#   PLAYWRIGHT_CORE   folder of playwright-core                     (default: found through node and npm)
#   REEL_CHROME   browser binary to use first                       (default: installed Chrome, else Playwright's Chromium)
R="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K="${KOKORO_HOME:-$HOME/kokoro}"
MODEL="${KOKORO_MODEL:-$K/kokoro-v1.0.onnx}"
VOICES="${KOKORO_VOICES:-$K/voices-v1.0.bin}"
RELEASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
ok=1
good() { echo "ok   $1"; }
miss() { ok=0; echo "MISS $1"; shift; for line in "$@"; do echo "       $line"; done; }

if [ -n "${REEL_PYTHON:-}" ]; then PY="$REEL_PYTHON"
elif [ -x "$K/.venv/bin/python" ]; then PY="$K/.venv/bin/python"
else PY="$(command -v python3 || true)"; fi
# Python probes run isolated (-I) from the skill folder, so modules planted in the current folder cannot run.
pyprobe() { (cd "$R" && "$PY" -I -c "$1") 2>/dev/null; }

if [ -n "$PY" ] && pyprobe "import kokoro_onnx, soundfile, numpy"; then good "python with kokoro-onnx ($PY)"
else miss "python with kokoro-onnx, soundfile and numpy" \
  "python3 -m venv \"$K/.venv\"" \
  "\"$K/.venv/bin/pip\" install kokoro-onnx soundfile numpy imageio-ffmpeg" \
  "(kokoro-onnx needs Python 3.10 to 3.13; or set REEL_PYTHON to a Python that has them)"; fi

if [ -f "$MODEL" ] && [ -f "$VOICES" ]; then good "kokoro model files ($K)"
else miss "kokoro model files (about 340 MB)" \
  "mkdir -p \"$K\"" \
  "curl -L -o \"$MODEL\" $RELEASE/kokoro-v1.0.onnx" \
  "curl -L -o \"$VOICES\" $RELEASE/voices-v1.0.bin"; fi

if [ -n "${FF:-}" ] && [ -x "$FF" ]; then good "ffmpeg ($FF)"
elif command -v ffmpeg >/dev/null 2>&1; then good "ffmpeg ($(command -v ffmpeg))"
elif [ -n "$PY" ] && pyprobe "import imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe()"; then good "ffmpeg (from the imageio-ffmpeg Python package)"
else miss "ffmpeg" "install ffmpeg (apt install ffmpeg / brew install ffmpeg), or: \"${PY:-python3}\" -m pip install imageio-ffmpeg"; fi

if ! command -v node >/dev/null 2>&1; then miss "node (version 18 or newer)" "install Node.js from https://nodejs.org, or with nvm or brew"
else
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 18 ] 2>/dev/null; then good "node $(node -v)"; else miss "node 18 or newer (found $(node -v))" "update Node.js"; fi
  # Playwright and a browser that really starts: this is what renders the frames
  if out="$(node "$R/engine/cli.mjs" check-browser 2>&1)"; then echo "$out"
  else ok=0; echo "$out" | sed -e 's/^reel: /MISS /' -e '/^MISS /!s/^\(  \)/     \1/'
    echo "$out" | grep -q "Playwright not found" && echo "       npm i -g playwright-core   (then, if no Chrome is installed: npx playwright-core install chromium)"; fi
fi

if [ $ok = 1 ]; then echo "all good"; else echo "something is missing: fix the MISS lines above and run this again"; exit 1; fi
