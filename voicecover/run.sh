#!/bin/bash
export PATH="$PATH:/c/Users/qinka/AppData/Local/Microsoft/WinGet/Packages/BtbN.FFmpeg.GPL.8.1_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-n8.1.2-21-gce3c09c101-win64-gpl-8.1/bin"
cd "$(dirname "$0")"
./venv/Scripts/python app.py
