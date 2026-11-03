---
name: location-ad-video
description: Make a professional short advertisement video for a real place (a park, shop, restaurant, clinic, project, venue or opening) that starts in space and flies down over real satellite imagery to the exact location, then sells it with benefit cards, a voiceover, music, subtitles and a logo + call-to-action end card, exported as 16:9 and 9:16 MP4s. Use this whenever someone wants a promo, advert, reel, teaser, "opening soon" or "where we are" video for a location, wants a video that zooms from the Earth/Google-Earth style down to an address or map pin, or shares a Google Maps link/coordinates plus a logo and asks for a video, even if they don't say "ad" (e.g. "اعمل فيديو للموقع", "make a video showing where our new branch is"). Works for Arabic (RTL) and English.
---

# Location ad video

You will produce a 15–30 s advert that answers, in order: *why should I watch* (hook) → *where is it* (space-to-site flight) → *why should I care* (benefits) → *what do I do now* (call to action, logo). The engine in `scripts/` renders everything from one `ad.json` brief, so most of your effort goes into the **brief and the words**, which is what makes an ad good. The rendering is mechanical.

## 1. Get the facts (don't invent them)

An ad that states wrong things is worse than no ad. Before writing anything, make sure you have, asking the user only for what's missing (one short round of questions, offering choices):

- **Exact location**: Google Maps link or coordinates. Short links (`maps.app.goo.gl/...`) resolve with `curl -sI <url> | grep -i location` → `q=LAT,LON`. Check the spot in satellite imagery (step 4 stills) and confirm it is the right building or plot.
- **Brand**: name (Arabic/English), logo file. A transparent PNG/SVG is best (`logoKind: "transparent"`). A photo of their sign also works well (`logoKind: "photo"`: the engine pans across the real sign). Don't try to cut a logo out of a photo with thresholds. It rarely works on textured backgrounds.
- **What it offers**: 2–4 concrete benefits. Only use what the user confirms. If they give features ("3 courts"), turn them into benefits ("رياضة لكل العائلة").
- **The call to action**: opening soon / visit / book / call / follow, plus any date, phone or handle, written exactly as the user gave it.
- **Language, voice gender, formats** (default: the audience's language, 20 s, `1920x1080` + `1080x1920`).

## 2. Write the brief: `ad.json`

Create a project folder (e.g. `ads/<name>/`) with `ad.json` and `assets/<logo>`. The full schema with a worked example is in `references/ad-json.md`. Read it when writing the file. The parts that matter most:

- `beats`: when each act starts. The defaults for 20 s are `space 0, country 2.4, city 4.4, district 6.4, site 8.6, offers 11.0, end 15.9`. Keep `end` at least 4 s before `duration`: the logo and CTA need time to land.
- `hook`: 3–6 words on screen in the first 2 s, the reason to keep watching ("شيء جديد قادم إلى العين", "Your new favourite café is here").
- `places`: 2–4 labels on the way down (country, city, optional landmark, district) so viewers recognise where they are.
- `offers`: 2–4 cards, each `{icon, ar|en, en}`. Icons: `family, kids, sports, events, nature, food, star`.
- `script`: the voiceover lines, each pinned to a beat. See section 3.
- `cta`: the end-card button text plus a location line.

## 3. Write the words like an ad

Read `references/ad-craft.md` for the beat sheet, word budgets and Arabic tips. The short version:

- **One idea per beat, few words.** Arabic TTS speaks at ~2.2 words/s. A 2.5 s gap holds 5 words, not 12. Silence over a flying camera with music is good. Narration doesn't need to cover every second.
- **Hook first.** Open on a promise or curiosity, not on "Welcome to…".
- **Say the brand name twice**: when the pin drops, and at the end with the CTA.
- **Benefits, then a clear CTA** that matches what the user asked for (never invent dates or prices).
- Lines that duplicate on-screen text (hook, brand name, CTA) get `"subtitle": false`. All other lines are subtitled automatically, because most social video is watched muted.
- Add Arabic diacritics (tashkeel) where pronunciation matters. They are stripped from subtitles automatically.

## 4. Build

Requirements: Python 3 with `numpy opencv-python-headless edge-tts`, Node with Playwright (Chromium), and ffmpeg. `S=<this skill>/scripts`, `P=<project>`:

```bash
python3 $S/make_voice.py $P        # TTS + timing table; exits 2 if a line overruns. Fix and re-run
python3 $S/fetch_imagery.py $P     # satellite tiles (cached in $P/tiles; ~1500 tiles, a few minutes)
python3 $S/grade_tiles.py $P       # evens out colour patchwork between imagery sources (~3 min)
python3 $S/make_audio.py $P        # original score on the beats + voice + whooshes/impact, -14 LUFS
node $S/render.js $P --stills 1,3.4,5.4,7.2,9.8,12.6,14.8,17,19.5   # review stills, both formats
```

If `make_voice.py` reports a line as too long, shorten the line first. Speeding the voice past `+8%` sounds rushed, and moving beats changes the pacing of the whole ad. Behind a corporate proxy, TLS errors from edge-tts or tile downloads usually mean `SSL_CERT_FILE` must point at the proxy CA bundle. Both scripts honour it.

## 5. Review before the full render

Rendering takes ~10 min per format, so check stills first. Make a contact sheet with `bash $S/contact_sheet.sh $P` and look at it yourself. Check:

- Hook text is readable over the globe in the first second.
- Labels sit on the right places, and the **pin is on the actual site**.
- No large colour seams in the mid-zoom stills (if there are, re-run `grade_tiles.py`).
- In 9:16, text stays inside the safe zone (not in the top 12% or the bottom 15%, where TikTok/Reels UI sits).
- Offer cards and subtitles don't overlap, and the end card shows logo, CTA and location fully.

Fix issues in `ad.json` (or the engine if it's a real bug), then re-render stills.

## 6. Render and deliver

```bash
node $S/render.js $P                    # all formats -> $P/out/<name>-<w>x<h>.mp4 + poster
```

Run it in the background and wait for the notification rather than polling. Send the MP4s (and posters) to the user. In your message, include the storyboard as a short table (time, picture, voice) so they can approve the words without watching frame by frame, plus anything they must check:

- **Imagery licence**: Esri World Imagery, credited on screen. Paid advertising should be checked against Esri's terms.
- **Voice**: Edge TTS via the unofficial `edge-tts` package. For paid campaigns, suggest re-recording the same script with a licensed TTS service or a voice actor (the timeline stays the same).
- The music and SFX are synthesized by `make_audio.py`, so there are no rights issues.
- You can't listen to audio, so say so and ask them to listen. You can check the waveform with `ffmpeg ... showwavespic`.

## Files

- `scripts/engine/ad.js`: the renderer (WebGL globe → satellite plane with tilt/orbit → 2D overlays). Every frame is a pure function of `t`.
- `scripts/render.js`: serves the engine + project to headless Chromium and encodes with ffmpeg (`--format`, `--stills`).
- `scripts/make_voice.py`, `make_audio.py`, `fetch_imagery.py`, `grade_tiles.py`, `contact_sheet.sh`.
- `references/ad-json.md`: full brief schema and example. `references/ad-craft.md`: how to write the ad.
