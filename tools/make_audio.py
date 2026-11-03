#!/usr/bin/env python3
"""Builds the soundtrack: processed narration + an original synthesized ambient score.

  build/vo_<n>.wav         cleaned, trimmed narration clips
  build/vo_durations.json  trimmed durations (read by earth.js for subtitles)
  build/audio.wav          final 48 kHz stereo mix, loudness-normalised
"""
import json, os, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build'); os.makedirs(BUILD, exist_ok=True)
CFG = json.load(open(os.path.join(ROOT, 'config.json')))
SR, DUR = 48000, CFG['duration']
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

def read_wav(p):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.float32).copy()

# ---------------------------------------------------------------- narration
VO_FX = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
         'highpass=f=75,equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.2:g=2.5,'
         'acompressor=threshold=-22dB:ratio=3:attack=4:release=140:makeup=4')
durs, voice = {}, np.zeros(N, np.float32)
for key, start in CFG['voice'].items():
    out = os.path.join(BUILD, f'{key}.wav')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(ROOT, 'assets/voice', key + '.mp3'), '-af', VO_FX, '-ar', str(SR), '-ac', '1', out])
    x = read_wav(out)
    a_, b_ = int(0.02 * SR), int(0.06 * SR)   # de-click
    x[:a_] *= np.linspace(0, 1, a_); x[-b_:] *= np.linspace(1, 0, b_)
    durs[key] = round(len(x) / SR, 3)
    i = int(start * SR); x = x[: max(0, N - i)]
    voice[i:i + len(x)] += x
json.dump(durs, open(os.path.join(BUILD, 'vo_durations.json'), 'w'), indent=1)
voice /= np.max(np.abs(voice)) + 1e-9
voice *= 0.5

# ---------------------------------------------------------------- score
def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def env(a, b, fade_in, fade_out):
    e = np.clip((t - a) / fade_in, 0, 1) * np.clip((b - t) / fade_out, 0, 1)
    return e * e * (3 - 2 * e)

def pad_voice(freq, e):
    out = np.zeros(N, np.float32)
    for det in (-0.07, 0.0, 0.065):            # three detuned voices (cents/100)
        f = freq * 2 ** (det / 12)
        ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, 7):                   # soft, filtered-saw-like spectrum
            out += (np.sin(2 * np.pi * f * k * t + ph * k) * (1 / k) * np.exp(-0.45 * k)).astype(np.float32)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))
    return out * e * lfo

CH = [  # (start, end, MIDI notes)
    (0.0, 10.4, [50, 57, 61, 64, 66]),          # Dmaj9
    (9.4, 18.6, [47, 54, 57, 61, 62]),          # Bm9
    (17.6, 26.4, [43, 50, 54, 57, 61]),         # Gmaj7(9)
    (25.4, DUR, [38, 45, 50, 52, 57, 66]),      # D(add9) resolution
]
pad = np.zeros(N, np.float32)
for a, b, notes in CH:
    e = env(a, b, 2.2, 2.0)
    for n in notes: pad += pad_voice(note(n), e) * (1.3 if n < 48 else 1.0)
pad /= np.max(np.abs(pad)) + 1e-9

# sub swell under each chord root
sub = np.zeros(N, np.float32)
for a, b, notes in CH:
    sub += np.sin(2 * np.pi * note(notes[0] - 12) * t).astype(np.float32) * env(a, b, 3.0, 2.5)
sub *= 0.35

# shimmering bell arpeggio (sparse, seeded)
bells = np.zeros(N, np.float32)
for a, b, notes in CH:
    tt = a + 0.8
    while tt < b - 1.0:
        n = notes[rng.integers(1, len(notes))] + 12 * int(rng.integers(1, 3))
        i = int(tt * SR); L = min(int(2.4 * SR), N - i)
        x = np.arange(L) / SR
        f = note(n)
        tone = (np.sin(2 * np.pi * f * x) + 0.25 * np.sin(2 * np.pi * 2.01 * f * x)) * np.exp(-x * 2.2) * (1 - np.exp(-x * 200))
        bells[i:i + L] += tone.astype(np.float32) * rng.uniform(0.5, 1.0)
        tt += rng.choice([0.85, 1.1, 1.3, 1.7])
bells *= 0.16

def noise_band(lo, hi, length):
    x = rng.standard_normal(length).astype(np.float32)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(length, 1 / SR)
    X *= ((f > lo) & (f < hi)) * 1.0
    return np.fft.irfft(X, length).astype(np.float32)

def whoosh(center, rise, fall, gain, lo=300, hi=6000):
    a = int((center - rise) * SR); b = int((center + fall) * SR)
    a = max(a, 0); b = min(b, N)
    L = b - a
    seg_t = np.arange(L) / SR
    e = np.where(seg_t < rise, (seg_t / rise) ** 2.5, np.exp(-(seg_t - rise) / (fall / 3)))
    # sweep: blend from dark to bright band as it rises
    dark, bright = noise_band(lo, hi * 0.3, L), noise_band(hi * 0.2, hi, L)
    mix = np.clip(seg_t / rise, 0, 1)
    out = np.zeros(N, np.float32)
    out[a:b] = ((1 - mix) * dark + mix * bright) * e * gain
    return out

fx = whoosh(1.2, 1.6, 1.5, 0.25, hi=3000)
fx += whoosh(10.35, 1.3, 1.4, 0.55)          # globe -> satellite map
fx += whoosh(25.75, 1.2, 1.6, 0.6)           # into the sign
# impact on the sign
i = int(25.95 * SR); L = min(int(3.0 * SR), N - i); x = np.arange(L) / SR
boom = np.sin(2 * np.pi * (55 * x - 12 * x * x)) * np.exp(-x * 2.4) * (1 - np.exp(-x * 400))
fx[i:i + L] += (boom * 0.9 + noise_band(30, 400, L) * np.exp(-x * 9) * 1.2).astype(np.float32)

music = pad * 0.55 + sub + bells

# ---------------------------------------------------------------- reverb (stereo, FFT convolution)
def reverb(x, seconds=3.2, seed=1):
    r = np.random.default_rng(seed)
    L = int(seconds * SR); k = np.arange(L) / SR
    ir = r.standard_normal(L).astype(np.float32) * np.exp(-k * 6.9 / seconds)
    ir[:int(0.012 * SR)] = 0
    n = 1 << int(np.ceil(np.log2(len(x) + L)))
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x)]
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)

wetL, wetR = reverb(music + bells * 2, seed=1), reverb(music + bells * 2, seed=2)
dry = music / (np.max(np.abs(music)) + 1e-9)
mL = 0.55 * dry + 0.6 * wetL
mR = 0.55 * dry + 0.6 * wetR
fxL = fx + 0.3 * reverb(fx, 2.0, 3); fxR = fx + 0.3 * reverb(fx, 2.0, 4)

# ducking under narration
venv = np.abs(voice)
win = int(0.25 * SR)
venv = np.convolve(venv, np.ones(win) / win, mode='same')
duck = 1 - 0.55 * np.clip(venv / (venv.max() * 0.25 + 1e-9), 0, 1)
# master fade in/out for the music
mfade = np.clip(t / 1.5, 0, 1) * np.clip((DUR - t) / 2.5, 0, 1)
musicL = mL * duck * mfade * 0.24
musicR = mR * duck * mfade * 0.24

vrev = reverb(voice, 1.2, 5) * 0.06
L_ = voice + vrev + musicL + fxL * 0.35
R_ = voice + vrev + musicR + fxR * 0.35
stereo = np.stack([L_, R_], 1)
stereo /= np.max(np.abs(stereo)) + 1e-9
stereo *= 0.9

raw = os.path.join(BUILD, 'audio_raw.f32')
stereo.astype(np.float32).tofile(raw)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                       '-af', 'loudnorm=I=-15:LRA=11:TP=-1.5', '-ar', str(SR), os.path.join(BUILD, 'audio.wav')])
os.remove(raw)
print('durations', durs)
print('wrote build/audio.wav')
