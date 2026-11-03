# LifeHub — location video (Zakher, Al Ain)

A short (14 s) location video. It opens among date palms, rises through the clouds over Al Ain, zooms into **Zakher (زاخر)**, drops a pin on the site and ends on the logo.

| Output | |
|---|---|
| `out/lifehub-zakher.mp4` | 1920×1080, 30 fps, 14 s |
| `out/lifehub-zakher-720p.mp4` | 1280×720, smaller file for WhatsApp / social |
| `out/poster.jpg` | last frame (logo end card) |

## Storyboard

| Time | Shot |
|---|---|
| 0.0–3.5 s | Ground level in a palm grove at sunrise. Out-of-focus fronds part as the camera moves forward. Caption: *العين · مدينة الحدائق / Al Ain — The Garden City* |
| 2.9–4.3 s | Camera rises through the clouds |
| 3.4–8.4 s | Aerial map of Al Ain (city, oasis, Jebel Hafeet), zooming into Zakher and Zakher Lake. Caption: *عند سفوح جبل حفيت / At the foot of Jebel Hafeet* |
| 8.4–10.4 s | Street level in Zakher. The pin drops on the plot with pulse rings. Caption: *نحن هنا · زاخر / We are here* |
| 10.4–14 s | The map blurs, the pin moves into the logo emblem, then the **LifeHub** wordmark and *زاخر، العين — الإمارات العربية المتحدة* appear |

The map is a stylised illustration and is not to scale.

## Editing & re-rendering

- **Preview live:** serve the folder (for example `npx serve .`) and open `index.html`. Click to restart.
- **Text, colours, logo:** edit `CONFIG` at the top of `scene.js`.
- **Your real logo:** save it as `assets/logo.png` (transparent PNG). It fades in over the drawn emblem. If the logo already contains the name, set `showWordmark: false`.
- **Render:** `node render.js` writes both MP4s and the poster. Requires Playwright (Chromium) and ffmpeg. `node render.js --stills 2,6,12` writes only preview PNGs.
