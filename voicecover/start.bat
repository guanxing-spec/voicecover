@echo off
cd /d "e:\VS_code_project\voicecover"
call venv\Scripts\activate
start http://localhost:5000
python app.py
