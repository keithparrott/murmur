# Murmur

A soundscape mixer for sleep and focus. Every sound is synthesized live in the browser with the Web Audio API, so there are no audio files, no loop seams, and nothing repeats.

- Sounds: rain (open air, tin roof, window, tent, leaves), thunder, wind, ocean, stream, fan, fire, wind chimes, and brown, pink and white noise.
- Mixer with per-sound levels, a master volume and an optional slow "drift" in levels.
- Saved presets, stored in the browser's local storage.
- Sleep timer that fades out over the last 90 seconds.

## Run it

It is one static file. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Browsers only start audio after a tap, so press play first.

## Host it on GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to Settings, then Pages.
3. Under Build and deployment, choose Deploy from a branch, pick `main` and `/ (root)`, and save.
4. The site appears at `https://<user>.github.io/<repo>/` after a minute or two.

## Notes

- Some phones pause web audio when the screen locks. Test a sleep mix before relying on it.
- Presets live in this browser only. They do not sync between devices.
