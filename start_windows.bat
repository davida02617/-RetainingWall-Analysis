@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto python_fallback
py -3 -m retaining_wall.server
pause
exit /b
:python_fallback
python -m retaining_wall.server
pause
