# Life Hub Park — location video (Zakher, Al Ain)

A 35-second, 1920×1080 video with Arabic narration. It starts in space, flies down over the Arabian Peninsula, the UAE, Al Ain and Zakher, lands on the Life Hub Park site (24.14527, 55.69249) and ends on the real Life Hub Park sign.

| Output | |
|---|---|
| `out/life-hub-park.mp4` | 1920×1080, 30 fps, with sound |
| `out/life-hub-park-720p.mp4` | smaller file for WhatsApp / social |
| `out/poster.jpg` | end card still |
| `v1-illustrated/` | the first, illustrated version |

## Storyboard and narration (Emirati male voice)

| Time | Picture | Voice |
|---|---|---|
| 0–5 s | Earth in space, turning towards Arabia | من هنا... من كوكبنا الأزرق، |
| 5–9 s | The Gulf, label: الإمارات العربية المتحدة | إلى دولة الإمارات العربية المتحدة، |
| 9–15 s | Satellite view, Al Ain and Jebel Hafeet | إلى مدينة العين... مدينة الواحات والخضرة، |
| 15–19 s | Zoom into Zakher | وفي قلب منطقة زاخر... |
| 19–25.5 s | The camera tilts and circles; the pin drops on the site, labelled لايف هب بارك | هنا... حيث تلتقي الطبيعة بالحياة. |
| 25.5–35 s | The real sign photo (pan, settle, light sweep) with زاخر · العين | لايف هب بارك... وجهتك القادمة، في زاخر، العين. |

Arabic subtitles are burned in, so the video also works with the sound off.

## How it is made

- `earth.js` draws every frame from a time value. A WebGL globe hands over to a WebGL plane covered in real satellite tiles. Labels, the pin, subtitles and the end card are drawn on top in 2D.
- `tools/fetch_imagery.py` downloads Esri World Imagery tiles into `tiles/` and builds the globe textures.
- `tools/grade_tiles.py` evens out colour differences between imagery sources, writing to `tiles_graded/`.
- `tools/make_voice.py` creates the narration with Microsoft Edge neural TTS (`ar-AE-HamdanNeural`).
- `tools/make_audio.py` cleans up the voice, synthesizes an original ambient score, whooshes and an impact, then mixes and normalizes everything to `build/audio.wav`.
- `render.js` renders the frames in headless Chromium and encodes them with ffmpeg.

```
pip install edge-tts numpy opencv-python-headless scipy
python3 tools/fetch_imagery.py && python3 tools/grade_tiles.py
python3 tools/make_voice.py && python3 tools/make_audio.py
node render.js                       # or: node render.js --stills 3,12,22
```

You can change the location and narration timings in `config.json`, and the narration text in `tools/make_voice.py`.

## Licensing notes

- **Satellite imagery:** © Esri, Maxar, Earthstar Geographics. Credited on screen. Check Esri's terms of use before paid advertising.
- **Narration:** Microsoft Edge TTS via the unofficial `edge-tts` tool. For paid campaigns, consider re-voicing with a licensed TTS service or a voice actor (same script).
- **Music and sound effects:** synthesized in `make_audio.py`, so there are no third-party rights.
