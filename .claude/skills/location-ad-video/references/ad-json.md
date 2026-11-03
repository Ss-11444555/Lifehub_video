# `ad.json`: the ad brief

All times are in seconds. All paths are relative to the project folder.

| key | required | meaning |
|---|---|---|
| `name` | yes | file-name stem for outputs (`out/<name>-1920x1080.mp4`) |
| `target` | yes | `{lat, lon}`: the exact site. The camera lands here and the pin drops here. |
| `maxZoom` | no | deepest imagery zoom (default 19 ≈ 0.3 m/px; use 18 if 19 looks blurry or blank) |
| `duration` | yes | total length (15–30) |
| `formats` | no | `["1920x1080", "1080x1920"]` (default `["1920x1080"]`). Any WxH works, e.g. `1080x1350`. |
| `beats` | yes | `{space, country, city, district, site, offers, end}`: start of each act |
| `brand` | yes | `{nameAr, nameEn, logo, logoKind: "photo"\|"transparent", accent: "#hex", background?: "#hex"}` |
| `hook` | yes | `{ar, en}`: the first-2-seconds headline (use `ar` for the main language even if it's English) |
| `places` | yes | list of `{level: country\|city\|landmark\|district, lat, lon, ar, en}`. Shown while the zoom passes that level. Use `zoomBand: [in0,in1,out0,out1]` to override. |
| `offers` | no | list of `{icon, ar, en}`. Icons: `family kids sports events nature food star` |
| `cta` | yes | `{ar, en, subAr, subEn}`: the button text and the location line under it |
| `voice` | yes | `{name, rate}`, e.g. `ar-AE-HamdanNeural`, `+2%` |
| `script` | yes | list of `{id, beat, offset?, text, subtitle?, voice?, rate?}`. Starts at `beats[beat] + offset` (default offset 0.25). |
| `music` | no | `{bpm: 100, mode: "major"\|"minor", root: 50}`. Root is a MIDI note (50 = D3). Use major for family/retail and minor for luxury/night. |
| `camera` | no | `{tilt: 50, orbit: -32, startFrom: {lat, lon}, zoom: {start, country, city, district, site, offers, end}, zoomKeys: [[t, zoom], ...]}` |

### Zoom levels (web-map zoom at the end of each beat)

`start 2.0` (whole Earth) → `country 5.2` → `city 10.3` → `district 13.4` → `site 16.6` → `offers 17.4` → `end 17.9`.
For a large country or a sparse rural site, lower `country`/`city` by about 1. For a dense city centre, the defaults are fine.
The globe hands over to satellite tiles around zoom 8–8.7.

### Worked example (20 s, Arabic, two formats)

```json
{
  "name": "life-hub-park",
  "target": { "lat": 24.1452741, "lon": 55.6924931 },
  "duration": 20,
  "formats": ["1920x1080", "1080x1920"],
  "beats": { "space": 0, "country": 2.4, "city": 4.4, "district": 6.4, "site": 8.6, "offers": 11.0, "end": 15.9 },
  "brand": { "nameAr": "لايف هب بارك", "nameEn": "LIFE HUB PARK", "logo": "assets/logo-sign.jpg", "logoKind": "photo", "accent": "#d9b46a" },
  "hook": { "ar": "شيء جديد قادم إلى العين", "en": "SOMETHING NEW IS COMING TO AL AIN" },
  "places": [
    { "level": "country", "lat": 23.75, "lon": 54.4, "ar": "الإمارات العربية المتحدة", "en": "UNITED ARAB EMIRATES" },
    { "level": "city", "lat": 24.2075, "lon": 55.7447, "ar": "العين", "en": "AL AIN" },
    { "level": "landmark", "lat": 24.06, "lon": 55.775, "ar": "جبل حفيت", "en": "JEBEL HAFEET" },
    { "level": "district", "lat": 24.1525, "lon": 55.7015, "ar": "زاخر", "en": "ZAKHER" }
  ],
  "offers": [
    { "icon": "family", "ar": "مساحات للعائلات والأطفال", "en": "FAMILY & KIDS" },
    { "icon": "sports", "ar": "رياضة ونشاطات", "en": "SPORTS" },
    { "icon": "events", "ar": "فعاليات مميزة", "en": "EVENTS" }
  ],
  "cta": { "ar": "الافتتاح قريباً", "en": "OPENING SOON", "subAr": "زاخر · العين", "subEn": "ZAKHER  ·  AL AIN  ·  UAE" },
  "voice": { "name": "ar-AE-HamdanNeural", "rate": "+2%" },
  "script": [
    { "id": "hook", "beat": "space", "offset": 0.3, "subtitle": false, "text": "شيءٌ جديدٌ قادمٌ للعين!" },
    { "id": "district", "beat": "district", "offset": 0.1, "text": "في قلبِ زاخر..." },
    { "id": "site", "beat": "site", "offset": 0.5, "subtitle": false, "text": "لايف هَب بارك." },
    { "id": "offers", "beat": "offers", "offset": 0.2, "text": "للعائلةِ والأطفال... رياضةٌ وفعالياتٌ لا تُنسى!" },
    { "id": "end", "beat": "end", "offset": 0.35, "subtitle": false, "text": "لايف هَب بارك... الافتتاحُ قريباً!" }
  ],
  "music": { "bpm": 100, "mode": "major", "root": 50 }
}
```

For an English ad, put English in the `ar` fields (they are just the primary-language slot) and use an English voice. RTL is applied per string automatically.
