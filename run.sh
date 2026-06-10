#!/usr/bin/env bash
# Full pipeline: generate tape -> Blender GPU render -> mux to MP4.
# usage: ./run.sh [N] [len] [race|elim] [theme]
set -e
N=${1:-12}; LEN=${2:-1}; MODE=${3:-race}; THEME=${4:-chrome}
STAMP=$(date +%s); WORK="out_$STAMP"; mkdir -p "$WORK/frames"
echo "[1/3] generating tape..."
node make-tape.js rand "$N" "$LEN" "$MODE" "$WORK/tape.json"
echo "[2/3] rendering on GPU (Blender/Cycles/OptiX)..."
blender -b -P render.py -- "$WORK/tape.json" "$WORK/frames" "$THEME"
echo "[3/3] muxing to MP4..."
ffmpeg -y -framerate 60 -i "$WORK/frames/f_%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 "$WORK/marble-$STAMP.mp4"
echo "DONE -> $WORK/marble-$STAMP.mp4"
