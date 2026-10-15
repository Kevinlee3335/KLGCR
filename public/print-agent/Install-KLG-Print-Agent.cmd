@echo off
setlocal
set "KLG_SETUP_TASK=%TEMP%\KLGPrintAgent-Setup-%RANDOM%.ps1"
echo Downloading KLG Print Agent setup from your KLGCR system...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://klgcr-maintenance-system.vercel.app/print-agent/Setup.ps1' -OutFile $env:KLG_SETUP_TASK -TimeoutSec 60; if((Get-FileHash -LiteralPath $env:KLG_SETUP_TASK -Algorithm SHA256).Hash -ne '0438BEC505EB6B0C055EE9B7076ED2B6EECBC5E831917DB29C880B77BDBAFFAB'){throw 'Setup verification failed. Download the latest installer from the system.'}; & $env:KLG_SETUP_TASK"
if errorlevel 1 echo Setup did not complete. Check the message above.
del "%KLG_SETUP_TASK%" >nul 2>nul
pause
