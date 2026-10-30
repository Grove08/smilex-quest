@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Сервер игры запущен. Закройте это окно, чтобы остановить.
start "" chrome --app=http://localhost:8765/ --start-fullscreen
python -m http.server 8765 || py -m http.server 8765
