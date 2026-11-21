"""reel-studio audio: voice per phrase (Kokoro, local), word timings, timeline, music + SFX mix.

usage:  python gen_audio.py <project_dir> [script_name]      (or: reel audio <project_dir> [script_name])
        script_name defaults to "script" (reads <project>/script.json)
        Run it with the Python that has kokoro-onnx installed (default: ~/kokoro/.venv/bin/python).

        Word times come from the model's own phoneme durations when kokoro-onnx can report them (0.6 or newer,
        see word_timing.py). Otherwise, or with REEL_TIMING=estimate, they are spread by syllable count.

env     KOKORO_HOME    folder holding the model files (default ~/kokoro)
        KOKORO_MODEL   path of kokoro-v1.0.onnx (default $KOKORO_HOME/kokoro-v1.0.onnx)
        KOKORO_VOICES  path of voices-v1.0.bin  (default $KOKORO_HOME/voices-v1.0.bin)

reads   <project>/brand.json   voice, speed, lang, pronounce, music
        <project>/<script>.json lead, pause, tail, scenes[{id, type, say, keys, ...}]
writes  <project>/build/<script>.timeline.json
        <project>/build/<script>/mix.wav    voice + sfx + music
        <project>/build/<script>/voice.wav  voice + sfx (lay a trending sound over it)
        <project>/build/.voice-cache/       spoken phrases, reused when a line has not changed
"""
import hashlib, json, os, re, sys
from pathlib import Path


def die(msg):
    sys.exit("gen_audio: " + msg)


if len(sys.argv) < 2: die("usage: python gen_audio.py <project_dir> [script_name]")
try:
    import numpy as np, soundfile as sf
    from kokoro_onnx import Kokoro
except ImportError as e:
    die(f"{e}. Install the voice packages into this Python: pip install kokoro-onnx soundfile numpy")

P = Path(sys.argv[1]).resolve()
NAME = sys.argv[2] if len(sys.argv) > 2 else "script"
for f in (P / "brand.json", P / f"{NAME}.json"):
    if not f.is_file(): die(f"file not found: {f}")
try:
    B = json.loads((P / "brand.json").read_text(encoding="utf-8"))
    S = json.loads((P / f"{NAME}.json").read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    die(f"not valid JSON: {e}")
if not isinstance(S.get("scenes"), list) or not S["scenes"]: die(f'{NAME}.json has no "scenes" list')
for i, sc in enumerate(S["scenes"]):
    if not sc.get("id") or not str(sc.get("say", "")).strip(): die(f'scene {i + 1} needs "id" and "say" (run: reel lint {P} {NAME})')
OUT = P / "build" / NAME; OUT.mkdir(parents=True, exist_ok=True)
VOICE = S.get("voice") or B.get("voice", "af_heart")
SPEED = S.get("speed") or B.get("speed", 1.08)
LANG = B.get("lang", "en-us")
SAY = B.get("pronounce", {})          # regex -> spoken spelling, e.g. {"\\bPM\\b": "P.M."}
MUSIC = {"on": True, "bpm": 100, "chords": "Am-F-C-G", "volume": 0.55, **B.get("music", {}), **S.get("music", {})}
R = 24000
KO = Path(os.environ.get("KOKORO_HOME") or Path.home() / "kokoro")
MODEL = Path(os.environ.get("KOKORO_MODEL") or KO / "kokoro-v1.0.onnx")
VOICES = Path(os.environ.get("KOKORO_VOICES") or KO / "voices-v1.0.bin")
for f in (MODEL, VOICES):
    if not f.is_file(): die(f"Kokoro model file not found: {f}\n  Download kokoro-v1.0.onnx and voices-v1.0.bin (see README.md) or set KOKORO_HOME.")
CACHE = P / "build" / ".voice-cache"; CACHE.mkdir(parents=True, exist_ok=True)
MEASURE = os.environ.get("REEL_TIMING", "model") != "estimate" and hasattr(Kokoro, "create_timed")
_kokoro = None; _tokenizer = None; WHY_ESTIMATED = set()
if not MEASURE: WHY_ESTIMATED.add("REEL_TIMING=estimate" if hasattr(Kokoro, "create_timed") else "this kokoro-onnx cannot report timings (0.6 or newer can)")


def kokoro():
    """The voice model, loaded only when something new must be spoken. When word times are measured it is
    loaded with its phoneme durations exposed as a second output (the model file itself is not changed)."""
    global _kokoro
    if _kokoro is not None: return _kokoro
    if MEASURE:
        try:
            import onnxruntime as ort, word_timing
            from kokoro_onnx.session import resolve_providers
            sess = ort.InferenceSession(word_timing.expose_durations(MODEL.read_bytes()), providers=resolve_providers())
            sess._model_path = str(MODEL)  # from_session reads the path from here; a session made from bytes has none
            _kokoro = Kokoro.from_session(sess, str(VOICES))
            if not _kokoro.has_timings: raise ValueError("the model gave no duration output")
            return _kokoro
        except Exception as e:  # a different model or library version: fall back to the plain model and estimates
            WHY_ESTIMATED.add(f"the model's durations could not be read ({e})")
    _kokoro = Kokoro(str(MODEL), str(VOICES))
    return _kokoro


def speak(text, voice, speed):
    """One phrase as (float32 samples, timing). timing is {"ph": phonemes, "starts": [seconds per phoneme]} or None.
    Both are cached on disk by text, voice, speed and language."""
    key = hashlib.sha1(json.dumps([text, voice, speed, LANG, MODEL.name], ensure_ascii=False).encode()).hexdigest()
    hit, thit = CACHE / f"{key}.npy", CACHE / f"{key}.timing.json"
    if hit.is_file() and not MEASURE: return np.load(hit), None
    if hit.is_file() and thit.is_file(): return np.load(hit), json.loads(thit.read_text(encoding="utf-8"))
    k = kokoro(); timing = None
    if MEASURE and getattr(k, "has_timings", False):
        ph = k.tokenizer.phonemize(text, LANG)
        if 0 < len(ph) <= 510:  # one batch: the same audio as create() gives, plus when each phoneme starts
            audio, _, marks = k.create_timed(ph, voice=voice, speed=speed, lang=LANG, is_phonemes=True, sentence_pause=0, clause_pause=0)
            if len(marks) == len(ph): timing = {"ph": ph, "starts": [round(m.start, 4) for m in marks]}
        else: audio, _ = k.create(text, voice=voice, speed=speed, lang=LANG)
    else: audio, _ = k.create(text, voice=voice, speed=speed, lang=LANG)
    y = audio.astype(np.float32); np.save(hit, y)
    if MEASURE: thit.write_text(json.dumps(timing, ensure_ascii=False), encoding="utf-8")
    return y, timing


def word_phonemes(word):
    """Phonemes of one written word said on its own (after the brand's pronunciations). Cached on disk."""
    global _tokenizer
    cache = CACHE / "word-phonemes.json"
    if not hasattr(word_phonemes, "known"):
        try: word_phonemes.known = json.loads(cache.read_text(encoding="utf-8"))
        except (OSError, ValueError): word_phonemes.known = {}
    key = f"{LANG}|{spoken(word)}"
    if key not in word_phonemes.known:
        if _tokenizer is None:
            from kokoro_onnx.tokenizer import Tokenizer
            _tokenizer = _kokoro.tokenizer if _kokoro is not None else Tokenizer()
        word_phonemes.known[key] = _tokenizer.phonemize(spoken(word), LANG)
        word_phonemes.dirty = True
    return word_phonemes.known[key]


def measured(words, timing, cut, length):
    """Start of each word in seconds from the start of the trimmed phrase, or None to fall back to an estimate."""
    if not timing: return None
    try:
        import word_timing
        starts = word_timing.word_starts([word_phonemes(w) for w in words], timing["ph"], timing["starts"], cut + length)
    except Exception as e:
        WHY_ESTIMATED.add(f"words could not be lined up ({e})"); return None
    if starts is None: return None
    out, low = [], 0.0
    for s in starts: low = min(length, max(low, s - cut)); out.append(low)
    return out


def spoken(text):
    for a, b in SAY.items(): text = re.sub(a, b, text)
    return text


def trim(x, thr=0.01, pad=0.02):
    """x without its leading and trailing silence, and how many seconds were cut from the front"""
    env = np.convolve(np.abs(x), np.ones(240) / 240, "same")
    idx = np.where(env > thr)[0]
    if len(idx) == 0: return x, 0.0
    a = max(0, idx[0] - int(pad * R))
    return x[a:min(len(x), idx[-1] + int(pad * R))], a / R


def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w: return 1
    return max(1, len(re.findall(r"[aeiouy]+", w)) - (1 if w.endswith("e") and len(w) > 3 else 0))


def split_phrases(words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[,.?:!]$", w): out.append(cur); cur = []
    if cur: out.append(cur)
    return out


def caption_groups(words, max_words=4):
    """Split at punctuation, long phrases into balanced groups, never leave a 1-word orphan."""
    groups = []
    for p in split_phrases(words):
        n = -(-len(p) // max_words); size = -(-len(p) // n)
        groups += [p[i:i + size] for i in range(0, len(p), size)]
    out = []
    for g in groups:
        if out and (len(g) == 1 or len(out[-1]) == 1) and len(out[-1]) + len(g) <= max_words + 1: out[-1] = out[-1] + g
        else: out.append(g)
    return out


t = S.get("lead", 0.3); scenes = []; clips = []; counted = {"model": 0, "estimate": 0}
for si, sc in enumerate(S["scenes"]):
    words = sc["say"].split()
    phrases = split_phrases(words)
    parts, wt, pos = [], [], 0.0
    for pi, p in enumerate(phrases):
        raw, timing = speak(spoken(" ".join(p)), sc.get("voice", VOICE), sc.get("speed", SPEED))
        y, cut = trim(raw)
        d = len(y) / R; tot = sum(syl(w) for w in p); acc = 0
        real = measured(p, timing, cut, d) if MEASURE else None
        counted["model" if real else "estimate"] += 1
        if real: wt += [round(pos + s, 3) for s in real]
        else:
            for w in p: wt.append(round(pos + acc / tot * d * 0.96, 3)); acc += syl(w)
        parts.append(y); pos += d
        if pi < len(phrases) - 1:
            gap = 0.26 if re.search(r"[.?!]$", p[-1]) else 0.12
            parts.append(np.zeros(int(gap * R), np.float32)); pos += gap
    x = np.concatenate(parts); sf.write(OUT / f"{sc['id']}.wav", x, R)
    dur = len(x) / R
    keys = set(sc.get("keys", []))
    chunks, wi = [], 0
    for g in caption_groups(words, S.get("caption_words", 4)):
        chunks.append({"words": [{"w": w, "t": round(t + wt[wi + n], 3), "key": w in keys} for n, w in enumerate(g)]})
        wi += len(g)
    last = si == len(S["scenes"]) - 1
    length = dur + sc.get("hold", S.get("pause", 0.45)) + (S.get("tail", 2.6) if last else 0)
    data = {kk: v for kk, v in sc.items() if kk not in ("say", "keys")}
    scenes.append({**data, "start": round(t, 3), "voice": round(dur, 3), "end": round(t + length, 3), "chunks": chunks})
    clips.append((t, x)); t += length
    print(f"{sc['id']:10s} {sc.get('type', '?'):8s} start {t - length:6.2f}  voice {dur:4.2f}s")
total = round(t, 3)
if getattr(word_phonemes, "dirty", False): (CACHE / "word-phonemes.json").write_text(json.dumps(word_phonemes.known, ensure_ascii=False), encoding="utf-8")
TIMING = "model" if not counted["estimate"] else "estimate" if not counted["model"] else "mixed"
TIMELINE = {"total": total, "fps": S.get("fps", 30), "name": NAME, "timing": TIMING, "scenes": scenes}
for opt in ("captions", "poster"):  # render options a script may set for itself
    if opt in S: TIMELINE[opt] = S[opt]
(P / "build" / f"{NAME}.timeline.json").write_text(json.dumps(TIMELINE, indent=1), encoding="utf-8")

# ---------------- mix ----------------
n = int(total * R); tt = np.arange(n) / R
voice = np.zeros(n, np.float32)
for st, x in clips: s = int(st * R); voice[s:s + len(x)] += x * 0.95


def env(d, a=0.004, rel=None):
    m = int(d * R); e = np.exp(-np.arange(m) / R / (rel or d / 4)); e[:int(a * R)] *= np.linspace(0, 1, int(a * R)); return e


def place(buf, at, sig):
    s = max(0, int(at * R)); e = min(n, s + len(sig))
    if s < n: buf[s:e] += sig[:e - s]


rng = np.random.default_rng(3)
DEFAULT_SFX = {"problem": "thud", "fix": "chime", "cta": "chime", "stat": "chime", "title": "whoosh"}
sfx = np.zeros(n, np.float32)
for sc in scenes:
    kind = sc.get("sfx", DEFAULT_SFX.get(sc.get("tone") or sc.get("type"), None))
    if sc is scenes[0] and "sfx" not in sc: kind = None
    if kind == "thud":
        d = 0.35; ts = np.arange(int(d * R)) / R
        place(sfx, sc["start"] - 0.02, (np.sin(2 * np.pi * (90 - 50 * ts / d) * ts) * env(d, rel=0.08) * 0.32).astype(np.float32))
    elif kind == "chime":
        d = 0.9; ts = np.arange(int(d * R)) / R
        tone = (np.sin(2 * np.pi * 1318.5 * ts) + 0.6 * np.sin(2 * np.pi * 1975.5 * ts) * (ts > 0.09)) * env(d, rel=0.22) * 0.09
        place(sfx, sc["start"] - 0.05, tone.astype(np.float32))
    if kind in ("chime", "whoosh"):
        d = 0.3 if kind == "chime" else 0.5
        noise = rng.standard_normal(int(d * R)) * np.sin(np.linspace(0, np.pi, int(d * R))) ** 2 * (0.035 if kind == "chime" else 0.05)
        place(sfx, sc["start"] - d, np.convolve(noise, np.ones(6) / 6, "same").astype(np.float32))

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def chord_freqs(name):
    m = re.match(r"([A-G])([#b]?)(m?)", name)
    root = NOTE[m[1]] + (1 if m[2] == "#" else -1 if m[2] == "b" else 0)
    semis = [0, 3, 7] if m[3] else [0, 4, 7]
    r = (root - 9) % 12  # semitones above A3
    return [220 * 2 ** ((r + s) / 12) * (0.5 if r >= 5 else 1) for s in semis]


music = np.zeros(n, np.float32)
if MUSIC["on"]:
    beat = 60 / MUSIC["bpm"]; CH = [chord_freqs(c) for c in MUSIC["chords"].split("-")]
    for b in range(int(total / beat) + 1):
        at = 0.3 + b * beat
        if at > total - 0.5: break
        if b % 2 == 0:
            d = 0.32; ts = np.arange(int(d * R)) / R
            place(music, at, (np.sin(2 * np.pi * (55 + 70 * np.exp(-ts * 30)) * ts) * env(d, rel=0.09) * 0.5).astype(np.float32))
        else:
            d = 0.12; nz = rng.standard_normal(int(d * R)); nz = nz - np.convolve(nz, np.ones(4) / 4, "same")
            place(music, at, (nz * env(d, rel=0.03) * 0.12).astype(np.float32))
        for h in (0, 0.5):
            d = 0.06; nz = rng.standard_normal(int(d * R)); nz = nz - np.convolve(nz, np.ones(3) / 3, "same")
            place(music, at + h * beat, (nz * env(d, rel=0.012) * 0.05).astype(np.float32))
        if b % 4 == 0:
            chord = CH[(b // 4) % len(CH)]; d = beat * 4; ts = np.arange(int(d * R)) / R
            sig = sum(np.sin(2 * np.pi * f * ts) + 0.3 * np.sin(4 * np.pi * f * ts) for f in chord)
            place(music, at, (sig * env(d, a=0.01, rel=0.9) * 0.05).astype(np.float32))
    venv = np.convolve(np.abs(voice), np.ones(int(0.12 * R)) / (0.12 * R), "same")
    duck = 1 - 0.55 * np.clip(venv / 0.05, 0, 1)
    fade = np.minimum(1, np.minimum(tt / 0.4, (total - tt) / 1.8))
    music *= (duck * fade).astype(np.float32)


def norm(x): return (x / max(1.0, np.max(np.abs(x)) / 0.97)).astype(np.float32)


sf.write(OUT / "mix.wav", norm(voice + sfx + music * MUSIC["volume"]), R)
sf.write(OUT / "voice.wav", norm(voice + sfx), R)
print("word times:", {"model": "from the model's phoneme durations", "estimate": "estimated from syllable counts", "mixed": f"from the model for {counted['model']} phrase(s), estimated for {counted['estimate']}"}[TIMING]
      + (f"  ({'; '.join(sorted(WHY_ESTIMATED))})" if WHY_ESTIMATED else ""))
print("total", total, "s  ->", P / "build" / f"{NAME}.timeline.json")
