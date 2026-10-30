# Murmur: notes for Claude Code

Single-file web app: `index.html` holds the markup, CSS and one inline `<script>`. There is no build step and no dependencies. Fonts come from Google Fonts with system fallbacks.

## How the code is organized (inside the script)

- `LAYERS`, `GROUPS`, `SURF`, `BUILTIN`: data tables. `LAYERS` lists every sound (id, name, trim, note). `GROUPS` sets the mixer sections. `SURF` holds the rain surface filter settings. `BUILTIN` holds the starter presets.
- Audio engine: `ensureCtx()` builds the graph `layer gain -> vol -> fade -> play -> compressor -> analyser/output`. Noise buffers (`makeNoise`, `makeDrops`, `makeThunder`, `makeCrackle`, `makeBubbles`) are generated once and shared.
- `BUILD[id](L, P)`: one function per sound that builds its nodes. A sound is built when its level rises above zero and torn down about 1.5 s after it returns to zero (`setLayer`). Event-style sounds (thunder, chimes) schedule themselves with timers and register cleanup in `L.onKill`.
- `ICONS[id]`: inline SVG path markup per sound.
- UI: `buildChannel`, `renderPresets`, `renderTransport`, timer chips. State lives in the `state` object.
- Presets: saved to `localStorage` under `murmur.presets.v1`. The code also tries the `db` capability from the claude.ai artifact host. Outside that host `window.claude` is absent, so it silently uses localStorage.

## Adding a sound

Touch four places: add an entry to `LAYERS`, put its id in a group in `GROUPS`, add an `ICONS[id]` entry, and add a `BUILD[id]` function. Keep it audible at slider 0.7 without clipping; tune with the `trim` value.

## Conventions

- Colors come from the CSS tokens at the top of the style block, with light and dark themes. Do not hard-code colors.
- Audio must start from a user gesture (the play button).
- Keep page width working at 400 px with no horizontal scroll.
- Generated sound must never be silent-then-loud: ramp gains with `setTargetAtTime`, never set them abruptly while playing.

## Checking changes

- Syntax: extract the script and run `node --check` on it.
- Buffer generators can be tested in Node with a fake `ctx` that provides `sampleRate` and `createBuffer`. Check peak, RMS and that no value is non-finite.
- Whether a sound is pleasant needs a human listening on headphones and phone speaker.

## Ideas on the roadmap

- A sample layer that plays recorded rain with crossfaded or granular looping.
- A recipe editor that exposes synthesis settings and saves them as shareable data.
- PWA manifest and icons so it can be installed to the home screen.
