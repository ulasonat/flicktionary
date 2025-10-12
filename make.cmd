@echo off
setlocal enableextensions

if "%~1"=="" goto :usage

set TARGET=%~1
if /I "%TARGET%"=="run" goto :run
if /I "%TARGET%"=="install" goto :install
if /I "%TARGET%"=="build" goto :build
if /I "%TARGET%"=="start" goto :start

echo Unknown target: %TARGET%
exit /b 1

:install
call npm install
exit /b %ERRORLEVEL%

:build
call npm run build
exit /b %ERRORLEVEL%

:start
call npm start
exit /b %ERRORLEVEL%

:run
call npm install
if errorlevel 1 exit /b %ERRORLEVEL%
call npm run build
if errorlevel 1 exit /b %ERRORLEVEL%
call npm start
exit /b %ERRORLEVEL%

:usage
echo Usage: make ^<run^|install^|build^|start^>
exit /b 1
