"""How close are word start times to the audio? Compares the two ways reel-studio times words:
the voice model's phoneme durations (engine/word_timing.py) and the old estimate (spread by syllable count).

usage:  ~/kokoro/.venv/bin/python scripts/measure_word_timing.py     (needs kokoro-onnx 0.6+ and the model files)

Method. A word's start can only be read from the audio itself where silence comes before it, so the test
sentences are lists ("Red, green, blue, ..."). For each word after the first, the reference is the nearest
sound onset: the first 2 ms frame louder than 2% of the clip's peak after at least 80 ms below it. Words with
no onset within 200 ms of the model's time are left out. The estimate is given the true start and end of the
speech, so it is judged only on how it spreads words inside the phrase. This says nothing direct about words
that run into each other with no pause, where no onset can be measured.
"""
import os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'engine'))
import numpy as np, onnxruntime as ort, word_timing
from kokoro_onnx import Kokoro

KO = os.environ.get('KOKORO_HOME') or os.path.expanduser('~/kokoro')
MODEL, VOICES, R = os.path.join(KO, 'kokoro-v1.0.onnx'), os.path.join(KO, 'voices-v1.0.bin'), 24000
TEXTS = ["Red, green, blue, yellow, purple, orange.", "Monday, Tuesday, Friday, Sunday.", "Apples, bananas, mangoes, lemons, melons.",
         "London, Madrid, Oslo, Lima, Nairobi.", "Stop. Go. Wait. Run. Jump. Sit.", "First, second, third, fourth, fifth.",
         "Bread, butter, garlic, pepper, ginger.", "No. Yes. Maybe. Never. Always."]
VOICES_USED = [('af_heart', 'en-us'), ('am_michael', 'en-us'), ('bm_george', 'en-gb'), ('af_bella', 'en-us')]
SPEEDS = (1.0, 1.08)


def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    return 1 if not w else max(1, len(re.findall(r"[aeiouy]+", w)) - (1 if w.endswith("e") and len(w) > 3 else 0))


def main():
    sess = ort.InferenceSession(word_timing.expose_durations(open(MODEL, 'rb').read()), providers=['CPUExecutionProvider'])
    sess._model_path = MODEL
    K = Kokoro.from_session(sess, VOICES)
    model, estimate = [], []
    for speed in SPEEDS:
        for voice, lang in VOICES_USED:
            for text in TEXTS:
                ph = K.tokenizer.phonemize(text, lang)
                audio, _, marks = K.create_timed(ph, voice=voice, speed=speed, lang=lang, is_phonemes=True, sentence_pause=0, clause_pause=0, trim=False)
                words = text.split()
                starts = word_timing.word_starts([K.tokenizer.phonemize(w, lang) for w in words], ph, [m.start for m in marks], len(audio) / R)
                fr = 48; n = len(audio) // fr
                rms = np.sqrt((audio[:n * fr].reshape(n, fr) ** 2).mean(1)); loud = rms > rms.max() * 0.02; q = int(0.08 * R / fr)
                onsets = [i * fr / R for i in range(q, n) if loud[i] and not loud[i - q:i].any()]
                sp = np.where(loud)[0]; a, b = sp[0] * fr / R, sp[-1] * fr / R; tot = sum(syl(w) for w in words); acc = 0
                for i, (w, s) in enumerate(zip(words, starts)):
                    est = a + acc / tot * (b - a) * 0.96; acc += syl(w)
                    if i == 0 or not onsets: continue
                    near = min(onsets, key=lambda o: abs(o - s))
                    if abs(near - s) > 0.2: continue
                    model.append((s - near) * 1000); estimate.append((est - near) * 1000)
    show = lambda d: f"mean {d.mean():+.0f} ms, mean absolute {np.abs(d).mean():.0f} ms, 90% within {np.percentile(np.abs(d), 90):.0f} ms, worst {np.abs(d).max():.0f} ms"
    print(f"{len(model)} words after a pause ({len(TEXTS)} sentences x {len(VOICES_USED)} voices x {len(SPEEDS)} speeds), start time minus sound onset:")
    print("  model durations:   ", show(np.array(model)))
    print("  syllable estimate: ", show(np.array(estimate)))


if __name__ == '__main__':
    main()
