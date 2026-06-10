@echo off
setlocal enabledelayedexpansion
set N=%1
if "%N%"=="" set N=12
set LEN=%2
if "%LEN%"=="" set LEN=1
set MODE=%3
if "%MODE%"=="" set MODE=race
set THEME=%4
if "%THEME%"=="" set THEME=chrome
for /f %%t in ('powershell -command "[int](Get-Date -UFormat %%s)"') do set STAMP=%%t
set WORK=out_%STAMP%
mkdir "%WORK%\frames"
echo [1/3] generating tape...
node make-tape.js rand %N% %LEN% %MODE% "%WORK%\tape.json"
echo [2/3] rendering on GPU (Blender/Cycles/OptiX)...
blender -b -P render.py -- "%WORK%\tape.json" "%WORK%\frames" %THEME%
echo [3/3] muxing to MP4...
ffmpeg -y -framerate 60 -i "%WORK%\frames\f_%%04d.png" -c:v libx264 -pix_fmt yuv420p -crf 18 "%WORK%\marble_%STAMP%.mp4"
echo DONE -^> %WORK%\marble_%STAMP%.mp4
endlocal
