@echo off
setlocal EnableDelayedExpansion

echo.
echo  ============================================
echo   VTU Automator — Quick Install (Windows)
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please install Node.js v18 or newer from:
    echo    https://nodejs.org
    echo.
    echo  Then run this script again.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do (
    set "NODE_MAJOR=%%v"
    set "NODE_MAJOR=!NODE_MAJOR:~1!"
)
if !NODE_MAJOR! lss 18 (
    echo  [ERROR] Node.js v18 or newer is required. You have v!NODE_MAJOR!.
    echo  Download the latest from https://nodejs.org
    pause
    exit /b 1
)

echo  [OK] Node.js found.
echo.

:: Install npm packages
echo  Installing dependencies...
call npm install 
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed.
echo.

:: Install Playwright browsers
echo  Installing Playwright browser (this may take a minute)...
call npx playwright install chromium --with-deps >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [WARN] Playwright browser install had an issue. Retrying...
    call npx playwright install chromium
)
echo  [OK] Browser ready.
echo.

echo  ============================================
echo   Starting VTU Automator...
echo   Your browser will open automatically.
echo  ============================================
echo.

npm start
