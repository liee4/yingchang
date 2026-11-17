@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0runtime\node\node.exe" (
  "%~dp0runtime\node\node.exe" web/scripts/portable.mjs %*
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 18 或更新版本后重新启动。
  pause
  exit /b 1
)
cd /d "%~dp0"
node web\scripts\serve.mjs --open %*
if errorlevel 1 pause
