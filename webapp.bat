@echo off
setlocal
cd /d "%~dp0"
py -3 serve.py
if errorlevel 1 (
  echo.
  echo Unable to launch the visualizer. Ensure Python is installed and port 8765 is free.
  pause
)
