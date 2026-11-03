#!/usr/bin/env python3
"""Narration for a location ad: TTS -> cleaned clips -> timeline (with timing checks).

Usage: python3 make_voice.py <project-dir>

Reads ad.json:  voice {name, rate}, script [{id, text, beat, offset?, subtitle?}], beats, duration
Writes:         voice/<id>.mp3 (cached by text+voice+rate), build/vo_<id>.wav, build/timeline.json
Prints a timing table and exits non-zero if a line overlaps the next one or runs past the end,
so the script can be shortened (or the beats moved) before rendering.

TTS: Microsoft Edge neural voices via the `edge-tts` package (pip install edge-tts).
Good Arabic voices: ar-AE-HamdanNeural (m), ar-AE-FatimaNeural (f), ar-SA-HamedNeural (m), ar-SA-ZariyahNeural (f).
English: en-US-AndrewNeural, en-GB-RyanNeural, ...
"""
import asyncio, hashlib, json, os, re, ssl, subprocess, sys
import numpy as np

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
AD = json.load(open(os.path.join(ROOT, 'ad.json')))
SR = 48000
VOICE = AD.get('voice', {}).get('name', 'ar-AE-HamdanNeural')
RATE = AD.get('voice', {}).get('rate', '-5%')
os.makedirs(os.path.join(ROOT, 'voice'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)

import edge_tts.communicate as comm
for ca in (os.environ.get('SSL_CERT_FILE'), '/root/.ccr/ca-bundle.crt'):
    if ca and os.path.exists(ca):
        comm._SSL_CTX = ssl.create_default_context(cafile=ca); break

FX = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
      'highpass=f=75,equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.2:g=2.5,'
      'acompressor=threshold=-22dB:ratio=3:attack=4:release=140:makeup=4')
DIACRITICS = re.compile('[ً-ْٰ]')

lines, problems = [], []
for item in AD['script']:
    key = item['id']
    mp3 = os.path.join(ROOT, 'voice', key + '.mp3')
    sig = hashlib.sha1(f"{VOICE}|{RATE}|{item['text']}".encode()).hexdigest()
    sigf = mp3 + '.sig'
    if not (os.path.exists(mp3) and os.path.exists(sigf) and open(sigf).read() == sig):
        asyncio.run(comm.Communicate(item['text'], item.get('voice', VOICE), rate=item.get('rate', RATE)).save(mp3))
        open(sigf, 'w').write(sig)
    wav = os.path.join(ROOT, 'build', f'vo_{key}.wav')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-af', FX, '-ar', str(SR), '-ac', '1', wav])
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', wav, '-f', 'f32le', '-'])
    dur = len(np.frombuffer(raw, np.float32)) / SR
    start = AD['beats'][item['beat']] + item.get('offset', 0.25)
    lines.append({'id': key, 'text': DIACRITICS.sub('', item['text']), 'start': round(start, 3), 'duration': round(dur, 3),
                  'subtitle': item.get('subtitle', True)})

lines.sort(key=lambda l: l['start'])
print(f"{'id':10} {'start':>6} {'end':>6}  text")
for i, l in enumerate(lines):
    end = l['start'] + l['duration']
    nxt = lines[i + 1]['start'] if i + 1 < len(lines) else AD['duration']
    flag = ''
    if end > nxt - 0.15:
        flag = f'  <-- too long by {end - nxt + 0.15:.2f}s'
        problems.append(l['id'])
    print(f"{l['id']:10} {l['start']:6.2f} {end:6.2f}  {l['text']}{flag}")
json.dump({'voice': VOICE, 'lines': lines}, open(os.path.join(ROOT, 'build', 'timeline.json'), 'w'), ensure_ascii=False, indent=1)
if problems:
    print('\nShorten these lines, speed the voice up (rate), or move their beats:', ', '.join(problems))
    sys.exit(2)
print('\ntimeline ok -> build/timeline.json')
