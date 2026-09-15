@echo off
cd /d "%~dp0"
echo Cierra Jarvis desde su icono junto al reloj antes de ejecutar este diagnostico.
"runtime\node.exe" server.mjs
pause
