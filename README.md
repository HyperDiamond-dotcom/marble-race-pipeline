# Marble Race Pipeline (GPU / Blender)

Photoreal marble-race videos, fully automated, rendered on the RTX 3080.

## Architecture
- **mr5.js** — deterministic physics + procedural course generator (Matter.js). Same seed -> identical race.
- **make-tape.js** — runs the sim headless in Node, writes a per-frame "tape" (`tape.json`): every marble/obstacle position + the course geometry.
- **render.py** — Blender 4.x script: builds a photoreal scene (glass marbles, metal track, studio lights, motion blur) from the tape and renders 1080x1920 frames on the GPU (Cycles/OptiX).
- **run.sh** — generate tape -> Blender render -> ffmpeg -> MP4.

## One-time setup (ServerPc)
```bash
./setup.sh
```

## Make a video
```bash
./run.sh 12 1 race chrome     # N=12, medium course, race mode, chrome theme
./run.sh 24 1.6 elim gold     # 24 marbles, long, elimination, gold theme
```
Themes: `chrome` `wood` `gold` `candy`.

Output: `out_<stamp>/marble-<stamp>.mp4`
