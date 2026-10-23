@echo off
setlocal
REM Keep this launcher beside make-assets.ps1, with an images folder beside both.
if not exist "%~dp0make-assets.ps1" (
  echo Missing make-assets.ps1. Save it beside this launcher first.
  pause
  exit /b 1
)
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0make-assets.ps1" -ImgDir "%~dp0images" -Out "%~dp0output"
set "result=%ERRORLEVEL%"
if not "%result%"=="0" echo Asset creation failed. Read the error above.
pause
exit /b %result%
