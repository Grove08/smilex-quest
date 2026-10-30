@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Игра запущена: http://localhost:8765/  (закройте это окно, чтобы остановить)
start "" http://localhost:8765/
python -m http.server 8765 || py -m http.server 8765
