"""reel-studio word timing: when each word of a phrase is really spoken.

Kokoro decides how long every phoneme lasts before it makes the sound, but the model file only hands back
the audio. Two things here turn that into word times, with no extra packages:

  expose_durations(model)   returns the model file's bytes with the phoneme durations added as a second
                            output called "duration". kokoro-onnx (0.6 or newer) reports phoneme timings
                            when a model has that output. The file on disk is not changed.
  word_starts(...)          lines the phonemes of each written word up with the phonemes of the whole
                            phrase, and reads off where each word begins.

Everything in this file is plain Python (no numpy), so `python3 word_timing.py --selftest` runs anywhere.
"""
import sys


# ---------- just enough protobuf to walk an ONNX file ----------
def _varint(b, i):
    v = s = 0
    while True:
        c = b[i]; i += 1; v |= (c & 0x7F) << s; s += 7
        if c < 0x80: return v, i


def _fields(b, start=0, end=None):
    """(field number, wire type, value start, value end, tag start) for each field of one message"""
    i = start; end = len(b) if end is None else end
    while i < end:
        t0 = i; tag, i = _varint(b, i); f, w = tag >> 3, tag & 7
        if w == 0: _, j = _varint(b, i)
        elif w == 2: n, i = _varint(b, i); j = i + n
        elif w == 5: j = i + 4
        elif w == 1: j = i + 8
        else: raise ValueError(f"unexpected protobuf wire type {w}")
        yield f, w, i, j, t0
        i = j


def _enc_varint(v):
    out = bytearray()
    while True:
        c = v & 0x7F; v >>= 7
        if v: out.append(c | 0x80)
        else: out.append(c); return bytes(out)


def _ld(field, payload):
    """one length-delimited field"""
    return _enc_varint(field << 3 | 2) + _enc_varint(len(payload)) + payload


# ONNX field numbers: ModelProto.graph = 7; GraphProto.node = 1, .output = 12;
# NodeProto.input = 1, .output = 2, .name = 3, .op_type = 4; ValueInfoProto.name = 1, .type = 2
def _graph(b):
    spans = [(s, e, t0) for f, w, s, e, t0 in _fields(b) if f == 7 and w == 2]
    if len(spans) != 1: raise ValueError("not an ONNX model (no graph)")
    return spans[0]


def _nodes_and_outputs(b, gs, ge):
    nodes, outputs = [], []
    for f, w, s, e, _ in _fields(b, gs, ge):
        if f == 1 and w == 2:
            n = {"in": [], "out": [], "op": ""}
            for ff, ww, ss, ee, _ in _fields(b, s, e):
                if ww != 2: continue
                if ff == 1: n["in"].append(bytes(b[ss:ee]).decode("utf-8", "replace"))
                elif ff == 2: n["out"].append(bytes(b[ss:ee]).decode("utf-8", "replace"))
                elif ff == 4: n["op"] = bytes(b[ss:ee]).decode("utf-8", "replace")
            nodes.append(n)
        elif f == 12 and w == 2:
            outputs += [bytes(b[ss:ee]).decode("utf-8", "replace") for ff, ww, ss, ee, _ in _fields(b, s, e) if ff == 1 and ww == 2]
    return nodes, outputs


def find_duration_tensor(nodes):
    """Name of the tensor holding the whole-number frame count of every phoneme.
    In Kokoro's graph it is Round(predicted duration / speed), then Clip and Cast."""
    made_by = {o: n for n in nodes for o in n["out"]}
    hits = [n for n in nodes if n["op"] == "Round" and n["in"] and made_by.get(n["in"][0], {}).get("op") == "Div" and "speed" in made_by[n["in"][0]]["in"]]
    if len(hits) != 1: raise ValueError(f"could not find the duration predictor in this model ({len(hits)} candidates)")
    name = hits[0]["out"][0]
    for _ in range(2):  # follow Clip, then Cast
        nxt = [n for n in nodes if name in n["in"] and n["op"] in ("Clip", "Cast")]
        if len(nxt) != 1: break
        name = nxt[0]["out"][0]
    return name


def expose_durations(model):
    """ONNX model bytes -> the same model with one more output, "duration" (frames per phoneme, int64).
    Returns the bytes unchanged if the model already has it. Raises ValueError if the graph is not Kokoro's."""
    b = memoryview(model)
    gs, ge, gt = _graph(b)
    nodes, outputs = _nodes_and_outputs(b, gs, ge)
    if "duration" in outputs: return bytes(model)
    tensor = find_duration_tensor(nodes)
    node = _ld(1, tensor.encode()) + _ld(2, b"duration") + _ld(3, b"reel_duration") + _ld(4, b"Identity")
    value = _ld(1, b"duration") + _ld(2, _ld(1, b"\x08\x07"))  # a tensor of INT64
    return bytes(b[:gt]) + _ld(7, bytes(b[gs:ge]) + _ld(1, node) + _ld(12, value)) + bytes(b[ge:])


# ---------- phonemes -> words ----------
_SKIP = set(" ˈˌː")  # spaces, stress and length marks do not help to tell words apart


def align_words(word_phonemes, phrase):
    """Where each word starts inside `phrase`, the phonemes of the whole phrase.

    word_phonemes holds the phonemes of every word said on its own. A word said alone and the same word inside
    a phrase rarely match exactly (stress moves, neighbours merge, one written word can be several spoken ones),
    so the two sequences are aligned by edit distance and each word starts at its first aligned phoneme
    (or at the space or stress mark just before it).
    Returns a list of indexes into `phrase`, never decreasing; None when nothing can be aligned."""
    A = [(c, i) for i, c in enumerate(phrase) if c not in _SKIP]
    B = [(c, w) for w, ph in enumerate(word_phonemes) for c in ph if c not in _SKIP]
    if not A or not B or not word_phonemes: return None
    n, m = len(A), len(B)
    cost = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): cost[i][0] = i
    for j in range(1, m + 1): cost[0][j] = j
    for i in range(1, n + 1):
        a = A[i - 1][0]; row = cost[i]; up = cost[i - 1]
        for j in range(1, m + 1):
            row[j] = min(up[j - 1] + (a != B[j - 1][0]), up[j] + 1, row[j - 1] + 1)
    first = [None] * len(word_phonemes)
    i, j = n, m
    while i > 0 and j > 0:  # walk back; a match or a swap ties phrase phoneme i to word phoneme j
        if cost[i][j] == cost[i - 1][j - 1] + (A[i - 1][0] != B[j - 1][0]): first[B[j - 1][1]] = A[i - 1][1]; i -= 1; j -= 1
        elif cost[i][j] == cost[i - 1][j] + 1: i -= 1
        else: j -= 1
    # a word with no phoneme of its own in the phrase starts where the next word does (or at the end)
    nxt = len(phrase)
    for w in range(len(first) - 1, -1, -1):
        if first[w] is None: first[w] = nxt
        nxt = first[w]
    low = 0
    for w in range(len(first)): low = first[w] = max(low, first[w])
    # A word begins with its stress mark, when it has one just before its first sound, and with the space before
    # that. Measured against the audio, the sound of a word after a pause starts where the model's space begins
    # (about 7 ms from it on average), and some 50 ms before the first phoneme's own start.
    out = []
    for k in first:
        if 0 < k <= len(phrase) and phrase[k - 1] in "ˈˌ": k -= 1
        if 0 < k <= len(phrase) and phrase[k - 1] == " ": k -= 1
        out.append(k)
    return out


def word_starts(word_phonemes, phrase, starts, end):
    """Start time of each word, from the start time of every phoneme of the phrase (`starts`, one per
    character of `phrase`) and the phrase length `end`. None when the lengths do not agree."""
    if len(starts) != len(phrase): return None
    at = align_words(word_phonemes, phrase)
    if at is None: return None
    return [starts[k] if k < len(starts) else end for k in at]


def _selftest():
    # protobuf: a tiny graph shaped like Kokoro's duration predictor
    def node(op, ins, outs): return _ld(1, b"".join(_ld(1, i.encode()) for i in ins) + b"".join(_ld(2, o.encode()) for o in outs) + _ld(4, op.encode()))
    graph = node("Sigmoid", ["x"], ["s"]) + node("ReduceSum", ["s"], ["r"]) + node("Div", ["r", "speed"], ["d"]) + node("Round", ["d"], ["rd"]) + \
        node("Clip", ["rd"], ["c"]) + node("Cast", ["c"], ["dur"]) + node("Decoder", ["dur"], ["audio"]) + _ld(12, _ld(1, b"audio"))
    model = _ld(1, b"\x08\x08") + _ld(7, graph) + _ld(8, b"tail")
    out = expose_durations(model)
    gs, ge, _ = _graph(memoryview(out)); nodes, outputs = _nodes_and_outputs(memoryview(out), gs, ge)
    assert outputs == ["audio", "duration"], outputs
    assert nodes[-1] == {"in": ["dur"], "out": ["duration"], "op": "Identity"}, nodes[-1]
    assert out.startswith(_ld(1, b"\x08\x08")) and out.endswith(_ld(8, b"tail"))
    assert expose_durations(out) == out, "a model that already has the output is left alone"
    try: expose_durations(_ld(7, node("Relu", ["x"], ["y"]))); raise AssertionError("expected ValueError")
    except ValueError: pass
    assert _enc_varint(300) == b"\xac\x02" and _varint(b"\xac\x02", 0) == (300, 2)
    # words: an exact phrase
    ph = "juː tˈaɪp ɐ nˈeɪm."
    assert align_words(["juː", "tˈaɪp", "ɐ", "nˈeɪm."], ph) == [0, 3, 9, 11], align_words(["juː", "tˈaɪp", "ɐ", "nˈeɪm."], ph)
    # one written word spoken as two ("Leafwink" -> "leaf wink"), and stress that differs in context
    assert align_words(["lˈiːf wˈɪŋk", "kˈiːps", "ɐ", "kˈɑːɹd"], "lˈiːf wˈɪŋk kˈiːps ɐ kˈɑːɹd") == [0, 11, 18, 20]
    assert align_words(["ðˈə", "ɹˈuːt"], "ðə ɹˈuːt") == [0, 2]
    # two written words that the voice runs together still get increasing starts
    got = align_words(["ˈɒv", "ðˈə", "wˈiːk"], "ɒvðə wˈiːk")
    assert got == sorted(got) and got[0] == 0 and got[1] == 2 and got[2] == 4, got
    assert align_words([], "abc") is None and align_words(["a"], "") is None
    starts = [i * 0.1 for i in range(len(ph))]
    ws = word_starts(["juː", "tˈaɪp", "ɐ", "nˈeɪm."], ph, starts, 2.0)
    assert [round(x, 1) for x in ws] == [0.0, 0.3, 0.9, 1.1], ws
    assert word_starts(["a"], "ab", [0.0], 1.0) is None
    print("word_timing selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv: _selftest()
    else: sys.exit("usage: python3 word_timing.py --selftest")
