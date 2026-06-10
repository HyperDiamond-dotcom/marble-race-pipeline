#!/usr/bin/env bash
# Run once on ServerPc (Ubuntu) to prepare the pipeline.
set -e
echo "== node deps =="; npm install
echo "== ffmpeg =="; which ffmpeg || sudo apt-get update && sudo apt-get install -y ffmpeg
echo "== blender =="; which blender || sudo snap install blender --classic
echo "== gpu =="; nvidia-smi --query-gpu=name,driver_version --format=csv,noheader || echo "!! NVIDIA driver missing — install nvidia-driver-550 and reboot"
echo "Setup complete. Test render:  ./run.sh 12 1 race chrome"
