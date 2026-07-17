# CURRENTS

An interactive WebGL study inspired by psychedelic optical art. A metallic sphere travels at a
constant slow speed along a fixed path while a potential-flow shader bends streamlines around it.

## Controls

- Use the left and right arrows to choose travel direction.
- Pause or resume the constant-speed motion.
- Drag directly on the canvas or use the position scrubber.
- Use the audio control after adding a licensed track.

## Add your audio

Place a legally licensed MP3 at:

```text
assets/currents-track.mp3
```

The commercial reference track is intentionally not included.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/`.

## Deploy standalone

Copy this directory into its own repository and enable GitHub Pages. It has no parent-site
dependency and no build step.

Append `?embed=1` for the compact portfolio preview.
