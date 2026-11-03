#!/usr/bin/env python3
"""Soundtrack for a location ad: narration + an original, beat-driven score, mixed for social.

Usage: python3 make_audio.py <project-dir>      (run make_voice.py first)

Score follows the ad beats so the music "hits" with the picture:
  hook (0 -> country)   pad + riser only: tension while the hook text is on screen
  country -> end        drums, pulsing bass, hats from the city beat, plucks from the site beat
  end                   riser, impact on the logo, then the chord resolves under the call to action
Everything is synthesized here, so there are no music licensing issues.
Output: build/audio.wav (48 kHz stereo, loudness-normalised to -14 LUFS for social platforms).
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
AD = json.load(open(os.path.join(ROOT, 'ad.json')))
TL = json.load(open(os.path.join(ROOT, 'build', 'timeline.json')))
B, DUR = AD['beats'], AD['duration']
MUS = AD.get('music', {})
BPM, ROOTNOTE = MUS.get('bpm', 100), MUS.get('root', 50)        # 50 = D3
SR = 48000; N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(11)
beat = 60 / BPM
q = lambda x: round(x / beat) * beat                               # snap to the beat grid
note = lambda n: 440.0 * 2 ** ((n - 69) / 12)

def env(a, b, fi, fo):
    e = np.clip((t - a) / max(fi, 1e-3), 0, 1) * np.clip((b - t) / max(fo, 1e-3), 0, 1)
    return e * e * (3 - 2 * e)

def place(dst, x, at, gain=1.0):
    i = int(at * SR)
    if i >= N or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    x = x[: N - i]; dst[i:i + len(x)] += x * gain

def noise_band(lo, hi, L):
    X = np.fft.rfft(rng.standard_normal(L)); f = np.fft.rfftfreq(L, 1 / SR)
    return np.fft.irfft(X * ((f > lo) & (f < hi)), L).astype(np.float32)

# progression I - vi - IV - V (major) or i - VI - III - VII (minor), one chord per bar
major = MUS.get('mode', 'major') == 'major'
PROG = [[0, 7, 11, 14, 16], [-3, 4, 7, 11, 12], [-7, 0, 4, 7, 11], [-5, 2, 7, 9, 14]] if major else \
       [[0, 7, 10, 14, 15], [-4, 3, 7, 10, 12], [3, 10, 14, 15, 19], [-2, 5, 9, 12, 14]]
bar = 4 * beat
chords = [(i * bar, PROG[i % 4]) for i in range(int(DUR / bar) + 2)]
end_t = B['end']                                     # the logo hit is frame-exact, not snapped

# ---- pad
pad = np.zeros(N, np.float32)
for start, ch in chords:
    if start > DUR: break
    resolve = start >= end_t - 1e-6
    notes = PROG[0] + [24] if resolve else ch
    a, b = start - 0.15, (DUR + 1 if resolve else start + bar + 0.25)
    e = env(a, b, 0.3, 0.35)
    if not e.any(): continue
    for n in notes:
        f = note(ROOTNOTE + n)
        for det in (-0.07, 0, 0.06):
            ff = f * 2 ** (det / 12)
            for k in range(1, 6):
                pad += (np.sin(2 * np.pi * ff * k * t + k) * np.exp(-0.5 * k) / k * e).astype(np.float32)
    if resolve: break
pad /= np.max(np.abs(pad)) + 1e-9

# ---- drums / bass / plucks on the grid
kick, hats, bass, pluck = (np.zeros(N, np.float32) for _ in range(4))
x = np.arange(int(0.45 * SR)) / SR
KICK = (np.sin(2 * np.pi * (45 * x + 75 / 18 * (1 - np.exp(-18 * x)))) * np.exp(-x * 7)).astype(np.float32)
xh = np.arange(int(0.06 * SR)) / SR
HAT = (noise_band(7000, 16000, len(xh)) * np.exp(-xh * 70)).astype(np.float32)
side = np.ones(N, np.float32)                                      # sidechain "pump" on the pad
groove_on, hats_on, pluck_on = q(B['country']), q(B['city']), q(B['site'])
tb = groove_on
while tb < end_t - 1e-6:
    place(kick, KICK, tb)
    i = int(tb * SR); L = min(int(0.3 * SR), N - i)
    side[i:i + L] = np.minimum(side[i:i + L], 1 - 0.45 * np.exp(-np.arange(L) / SR * 9))
    if tb >= hats_on: place(hats, HAT, tb + beat / 2, 0.8)
    chord = next(c for s, c in reversed(chords) if s <= tb + 1e-6)
    for half in (0, 0.5):                                           # 8th-note pulsing bass
        xb = np.arange(int(beat / 2 * SR)) / SR
        fb = note(ROOTNOTE - 12 + chord[0])
        place(bass, ((np.sin(2 * np.pi * fb * xb) + 0.3 * np.sin(4 * np.pi * fb * xb)) * np.exp(-xb * 6) * (1 - np.exp(-xb * 300))).astype(np.float32), tb + half * beat)
    if tb >= pluck_on:
        for k, half in enumerate((0, 0.5)):
            n = chord[1 + (int(tb / beat) * 2 + k) % 4] + 12
            xp = np.arange(int(0.5 * SR)) / SR; fp = note(ROOTNOTE + n)
            tone = sum(np.sin(2 * np.pi * fp * j * xp) / j ** 1.4 for j in range(1, 5)) * np.exp(-xp * 9)
            place(pluck, tone.astype(np.float32), tb + half * beat)
    tb += beat

# ---- transitions: whooshes, riser, impact
fx = np.zeros(N, np.float32)
def whoosh(center, rise, fall, gain):
    L = int((rise + fall) * SR); s = np.arange(L) / SR
    e = np.where(s < rise, (s / rise) ** 2.5, np.exp(-(s - rise) / (fall / 3)))
    m = np.clip(s / rise, 0, 1)
    place(fx, (((1 - m) * noise_band(200, 1800, L) + m * noise_band(1200, 8000, L)) * e).astype(np.float32), center - rise, gain)
for k in ('country', 'city', 'site'):
    whoosh(B[k], 0.7, 0.8, 0.35)
whoosh(end_t, 1.6, 1.2, 0.6)
L = int(3 * SR); xi = np.arange(L) / SR
place(fx, (np.sin(2 * np.pi * (55 * xi - 10 * xi * xi)) * np.exp(-xi * 2.5) * (1 - np.exp(-xi * 400))).astype(np.float32), end_t, 1.0)
place(fx, (noise_band(30, 500, L) * np.exp(-xi * 10)).astype(np.float32), end_t, 1.5)

# ---- voice
voice = np.zeros(N, np.float32)
for l in TL['lines']:
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'build', f"vo_{l['id']}.wav"), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    v = np.frombuffer(raw, np.float32).copy()
    a_, b_ = int(0.02 * SR), int(0.06 * SR); v[:a_] *= np.linspace(0, 1, a_); v[-b_:] *= np.linspace(1, 0, b_)
    place(voice, v, l['start'])
voice = voice / (np.max(np.abs(voice)) + 1e-9) * 0.5

def reverb(x, sec, seed):
    r = np.random.default_rng(seed); L = int(sec * SR); k = np.arange(L) / SR
    ir = (r.standard_normal(L) * np.exp(-k * 6.9 / sec)).astype(np.float32); ir[: int(0.01 * SR)] = 0
    n = 1 << int(np.ceil(np.log2(len(x) + L)))
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)

norm = lambda a: a / (np.max(np.abs(a)) + 1e-9)
padS = norm(pad) * side
music_dry = 0.55 * padS + 0.9 * norm(kick) + 0.18 * norm(hats) + 0.45 * norm(bass) + 0.22 * norm(pluck)
amb = 0.5 * padS + 0.4 * norm(pluck)
wl, wr = reverb(amb, 2.6, 1), reverb(amb, 2.6, 2)
venv = np.convolve(np.abs(voice), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode='same')
duck = 1 - 0.5 * np.clip(venv / (venv.max() * 0.25 + 1e-9), 0, 1)
fade = np.clip(t / 0.3, 0, 1) * np.clip((DUR - t) / 1.2, 0, 1)
fxw = fx + 0.3 * reverb(fx, 1.8, 3)
mixL = voice + 0.05 * reverb(voice, 1.0, 5) + (norm(music_dry) * 0.6 + 0.35 * wl) * duck * fade * 0.3 + fxw * 0.3
mixR = voice + 0.05 * reverb(voice, 1.0, 6) + (norm(music_dry) * 0.6 + 0.35 * wr) * duck * fade * 0.3 + fxw * 0.3
st = np.stack([mixL, mixR], 1); st = st / (np.max(np.abs(st)) + 1e-9) * 0.9
raw = os.path.join(ROOT, 'build', 'audio_raw.f32'); st.astype(np.float32).tofile(raw)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                       '-af', 'loudnorm=I=-14:LRA=9:TP=-1.0', '-ar', str(SR), os.path.join(ROOT, 'build', 'audio.wav')])
os.remove(raw)
print(f'wrote build/audio.wav  ({BPM} bpm, groove from {groove_on:.2f}s, impact at {end_t:.2f}s)')
