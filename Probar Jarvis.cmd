@echo off
cd /d "%~dp0"
"runtime\node.exe" --test test\*.test.mjs
pause
