# Setup on the RTX 3080 PC (Windows)

## 1. Install tools (PowerShell as admin)
```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id BlenderFoundation.Blender
winget install -e --id Gyan.FFmpeg
```
Then open a NEW terminal so PATH refreshes. Verify:
```
node -v
blender --version
ffmpeg -version
```
If `blender` isn't found, add its folder (e.g. `C:\Program Files\Blender Foundation\Blender 4.2\`) to PATH, or edit run.bat to use the full path to blender.exe.

## 2. Get the project
```
git clone https://github.com/thelittleking0528-web/marble-race-pipeline.git
cd marble-race-pipeline
npm install
```

## 3. Make a video
```
run.bat 12 1 race chrome
```
Output lands in `out_<stamp>\marble_<stamp>.mp4`. Themes: chrome, wood, gold, candy.

## 4. (later) Daily automation
Windows Task Scheduler -> Create Task -> trigger 4x/day -> action: run a wrapper .bat that calls run.bat then the uploader.
