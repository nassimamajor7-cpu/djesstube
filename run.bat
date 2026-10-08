@echo off
title DjessTube
cd /d "%~dp0"
echo Installation des dependances (premiere fois seulement)...
python -m pip install -q -r requirements-local.txt
echo.
echo  Sur ce PC       : http://localhost:5000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo  Telephone/tablette (meme wifi) : http://%%a:5000
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5000"
set HOST=0.0.0.0
python app.py
pause
