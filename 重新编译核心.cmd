@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "YINGCHANG_NODE=node"
if exist "%~dp0runtime\node\node.exe" set "YINGCHANG_NODE=%~dp0runtime\node\node.exe"
echo 请先关闭当前映场服务窗口；本步骤需要支持 C++17 的编译器。
if exist "%~dp0runtime\node\node.exe" (
  "%YINGCHANG_NODE%" web/scripts/portable.mjs --refresh-core
) else (
  "%YINGCHANG_NODE%" web/scripts/build-core.mjs
)
if errorlevel 1 (
  echo 编译未完成，请查看上方提示。可设置 CXX 为编译器完整路径。
  pause
  exit /b 1
)
echo 编译完成，可以重新启动映场。
pause
