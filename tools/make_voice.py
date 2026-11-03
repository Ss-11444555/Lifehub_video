#!/usr/bin/env python3
"""Generates the narration clips (Microsoft Edge neural TTS, voice ar-AE-HamdanNeural).
Edit the LINES below and re-run; render picks up the new durations automatically."""
import asyncio, json, os, ssl, subprocess
import edge_tts.communicate as c
CA = '/root/.ccr/ca-bundle.crt'
if os.path.exists(CA): c._SSL_CTX = ssl.create_default_context(cafile=CA)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE, RATE = 'ar-AE-HamdanNeural', '-12%'
LINES = [
    ('vo1', 'من هنا... من كوكبِنا الأزرق،'),
    ('vo2', 'إلى دولةِ الإماراتِ العربيةِ المتحدة،'),
    ('vo3', 'إلى مدينةِ العين... مدينةِ الواحاتِ والخُضرة،'),
    ('vo4', 'وفي قلبِ منطقةِ زاخر...'),
    ('vo5', 'هنا... حيثُ تلتقي الطبيعةُ بالحياة.'),
    ('vo6', 'لايف هَب بارك... وِجهتُك القادمة، في زاخر، العين.'),
]
out = {}
for key, text in LINES:
    p = os.path.join(ROOT, 'assets', 'voice', key + '.mp3')
    asyncio.run(c.Communicate(text, VOICE, rate=RATE).save(p))
    d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]))
    out[key] = {'text': text.replace('َ', '').replace('ِ', '').replace('ُ', ''), 'duration': round(d, 3)}
    print(key, d)
json.dump(out, open(os.path.join(ROOT, 'assets', 'voice', 'lines.json'), 'w'), ensure_ascii=False, indent=1)
