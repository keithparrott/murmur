# Murmur: notes for Claude Code

Static web app with no build step and no dependencies. Fonts come from Google Fonts with system fallbacks.

## Files

- `index.html`: markup only. It links `styles.css` and loads the scripts in order.
- `styles.css`: all styles, with the theme tokens at the top.
- `data.js`: helpers (`$`, `clamp`), `LAYERS`, `GROUPS`, `SURF`, `BUILTIN` and `state`. Loads first.
- `audio.js`: audio engine, `BUILD`, layers, drift (`effLevel`), play/pause and the sleep timer.
- `scene-art.js`: `SCENE_ART`, the pixel scene's data: palettes per time of day, storm colours, tree, creek, puddle and cloud positions, and small sprites. No drawing code.
- `scene.js`: the pixel scene renderer. Exposes one global, `scene`.
- `ui.js`: spectrum scope, `ICONS`, mixer, transport UI, presets, storage and boot. Loads last.

The scripts are classic scripts (not ES modules) so the page still works when opened from disk. They share top-level names, so keep new names distinct. Each file starts with `'use strict'`.

Read efficiently: grep for the function or table you need and read a small line range. Don't read whole files.

## How the code is organized

- `LAYERS`, `GROUPS`, `SURF`, `BUILTIN`: data tables. `LAYERS` lists every sound (id, name, trim, note). `GROUPS` sets the mixer sections. `SURF` holds the rain surface filter settings. `BUILTIN` holds the starter presets.
- Audio engine: `ensureCtx()` builds the graph `layer gain -> vol -> fade -> play -> compressor -> analyser/output`. Noise buffers (`makeNoise`, `makeDrops`, `makeThunder`, `makeCrackle`, `makeBubbles`) are generated once and shared.
- `BUILD[id](L, P)`: one function per sound that builds its nodes. A sound is built when its level rises above zero and torn down about 1.5 s after it returns to zero (`setLayer`). Event-style sounds (thunder, chimes) schedule themselves with timers and register cleanup in `L.onKill`.
- `ICONS[id]`: inline SVG path markup per sound.
- UI: `buildChannel`, `renderPresets`, `renderTransport`, timer chips. State lives in the `state` object.
- Scene: a cabin on a bluff, drawn into a 320x200 canvas (wider or taller to fit the window, cropped in on phones) and scaled up by CSS with sharp pixels. Static parts are painted once as palette indices; each frame maps them through the palette for the time of day, storm, haze, lightning and sleep dim, then draws moving parts on top. It reads `effLevel(id)` every frame, so it follows sliders, presets and drift even while paused. The audio calls `scene.event('thunder', gain)` and `scene.event('chime', delaySeconds)`; while paused the scene makes its own lightning and chime strikes. Add `?hour=21` to the URL to preview a time of day.
- Panel: the controls live in `#panel`, a bottom sheet on phones and a right-hand drawer from 720px. `setPanel` in `ui.js` opens it, remembers the choice in `localStorage` (`murmur.panel`) and tells the scene to shift so the cabin stays in view.
- Presets: saved to `localStorage` under `murmur.presets.v1`. The code also tries the `db` capability from the claude.ai artifact host. Outside that host `window.claude` is absent, so it silently uses localStorage.

## Adding a sound

Touch four places: add an entry to `LAYERS` and put its id in a group in `GROUPS` (`data.js`), add an `ICONS[id]` entry (`ui.js`), add a `BUILD[id]` function (`audio.js`), and give it something to show in `draw` in `scene.js`. Keep it audible at slider 0.7 without clipping; tune with the `trim` value.

## Conventions

- Colors come from the CSS tokens at the top of `styles.css`, with light and dark themes. Do not hard-code colors. The scene has its own palette in `scene-art.js`; add a key there rather than a colour in `scene.js`.
- The scene runs at about 30 fps and stops while the tab is hidden. Scene changes should ease in (levels are smoothed over about 0.35 s), never pop.
- Audio must start from a user gesture (the play button).
- Keep page width working at 400 px with no horizontal scroll.
- Generated sound must never be silent-then-loud: ramp gains with `setTargetAtTime`, never set them abruptly while playing.

## Checking changes

- Syntax: run `node --check` on each `.js` file.
- Buffer generators can be tested in Node with a fake `ctx` that provides `sampleRate` and `createBuffer`. Check peak, RMS and that no value is non-finite.
- Whether a sound is pleasant needs a human listening on headphones and phone speaker.
- Scene: open `?hour=13` and `?hour=22` at desktop and 400 px widths, push sliders and check the console. Judging the look needs a human.

## Ideas on the roadmap

- A sample layer that plays recorded rain with crossfaded or granular looping.
- A recipe editor that exposes synthesis settings and saves them as shareable data.
- PWA manifest and icons so it can be installed to the home screen.
- Show the rain surface in the scene (tin roof, tent and so on); today it only changes the sound.
