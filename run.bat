@echo off
title DjessTube
cd /d "%~dp0"
echo Installation des dependances (premiere fois seulement)...
python -m pip install -q -r requirements-local.txt
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5000"
python app.py
pause
