@echo off
setlocal
title Iniciar Portal Apice
echo Iniciando o Portal Apice. Aguarde...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-system.ps1"
if errorlevel 1 (
  echo.
  echo O sistema nao iniciou. Confira a mensagem acima.
  pause
  exit /b 1
)
endlocal
