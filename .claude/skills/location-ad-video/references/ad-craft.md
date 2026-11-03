# Writing the ad

People decide in about 1–2 seconds whether to keep watching, and most watch with the sound off. Every choice below follows from those two facts.

## Beat sheet (20 s default)

| beat | time | picture | words (on screen / voice) | job |
|---|---|---|---|---|
| space | 0–2.4 | Earth, hook headline | hook, 3–6 words, spoken | stop the scroll |
| country, city | 2.4–6.4 | dive, place labels | music only, or ≤4 words | "this is near me" |
| district | 6.4–8.6 | neighbourhood | "في قلب زاخر" / "Right in the heart of …" | precise location |
| site | 8.6–11 | camera lands and tilts, pin drops, brand name card | the brand name, spoken | name + place together |
| offers | 11–15.9 | benefit cards appear one by one | one line naming the benefits | why care |
| end | 15.9–20 | logo, CTA button, location | brand + CTA, spoken | what to do now |

For 15 s, compress the dive (country 1.8, city 3.2, district 4.6, site 6.2, offers 8.2, end 11.2) and use at most 2 offers. For 30 s, give the offers more time (one short spoken line per card) and hold the end card for 5 s.

## Word budgets

- Arabic neural TTS: about 2.2 words/s. English: about 2.6 words/s.
- On-screen card titles: 2–4 words. English subtitle line under them: 1–3 words in CAPS.
- The hook on screen and the hook spoken can differ slightly. Spoken lines should be shorter and punchier ("شيءٌ جديدٌ قادمٌ للعين!").
- If `make_voice.py` flags a line, remove words: a list of benefits joined with "..." reads better than a full sentence.

## Hooks that work for places

- Curiosity or news: "شيء جديد قادم إلى …", "Something new is coming to …"
- Direct benefit: "أجمل وجهة للعائلة في …", "Weekend plans, sorted."
- Local pride or identity: "من قلب العين…"

Avoid "Welcome to…", long company names, or the address as the opening line. The flight already shows where it is.

## Calls to action

Use what the user actually asked for, nothing invented:
- Opening soon: "الافتتاح قريباً / OPENING SOON". Add a date only if given.
- Visit: "زورونا اليوم / VISIT US TODAY". Put the opening hours in `subAr` if given.
- Follow or book: put the handle, phone or URL in `subAr`/`subEn` and spell it exactly as given.

## Arabic specifics

- Add tashkeel on words the TTS might misread (brand names transliterated from English: "لايف هَب"). Subtitles strip it automatically.
- Modern Standard Arabic with a Gulf voice (`ar-AE-*`) suits UAE audiences. Use `ar-SA-*` for Saudi and `ar-EG-SalmaNeural`/`ar-EG-ShakirNeural` for Egypt.
- Brand names in Latin script can stay Latin in `nameEn`, but give the Arabic spelling in `nameAr` (it is what's spoken and shown first).
- Use "·" or "،" as separators. Avoid mixing Latin and Arabic in one string (bidi reordering looks broken).

## Honesty

Don't claim things the user didn't confirm ("the biggest", "open 24/7", prices, dates). Mild puffery ("لا تُنسى", "unforgettable") is fine. If you need a stronger claim, ask for it.
