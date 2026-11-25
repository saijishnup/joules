@echo off
rem Double-click to start Joules (same as run.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
pause
