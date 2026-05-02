# VTU Automator — PowerShell One-Liner Installer
# Usage: irm https://raw.githubusercontent.com/Pruthvi-123-prog/AUTOMATOR/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host "   VTU Automator — One-Click Installer" -ForegroundColor Cyan
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Git ──────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host " [ERROR] Git is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host " Please install Git from https://git-scm.com and run this command again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── 2. Check Node.js ──────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host " [ERROR] Node.js is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host " Please install Node.js v18 or newer from https://nodejs.org and run this command again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$nodeVersion = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 18) {
    Write-Host " [ERROR] Node.js v18 or newer is required. You have v$nodeVersion." -ForegroundColor Red
    Write-Host " Download the latest from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

Write-Host " [OK] Git and Node.js found." -ForegroundColor Green
Write-Host ""

# ── 3. Clone the repository ───────────────────────────────────────────────────
$repoUrl  = "https://github.com/Pruthvi-123-prog/AUTOMATOR.git"
$destDir  = Join-Path $PWD "AUTOMATOR"

if (Test-Path $destDir) {
    Write-Host " [INFO] Folder 'AUTOMATOR' already exists — pulling latest changes..." -ForegroundColor Yellow
    Set-Location $destDir
    git pull
} else {
    Write-Host " Cloning VTU Automator..." -ForegroundColor Cyan
    git clone $repoUrl $destDir
    Set-Location $destDir
}

Write-Host ""
Write-Host " [OK] Repository ready." -ForegroundColor Green
Write-Host ""

# ── 4. Install npm dependencies ───────────────────────────────────────────────
Write-Host " Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host " [ERROR] npm install failed. Check your internet connection." -ForegroundColor Red
    exit 1
}
Write-Host " [OK] Dependencies installed." -ForegroundColor Green
Write-Host ""

# ── 5. Install Playwright browser ─────────────────────────────────────────────
Write-Host " Installing Playwright browser (may take a minute)..." -ForegroundColor Cyan
npx playwright install chromium --with-deps 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host " [WARN] Playwright browser install had an issue. Retrying..." -ForegroundColor Yellow
    npx playwright install chromium
}
Write-Host " [OK] Browser ready." -ForegroundColor Green
Write-Host ""

# ── 6. Launch the app ─────────────────────────────────────────────────────────
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host "   Starting VTU Automator..." -ForegroundColor Cyan
Write-Host "   Your browser will open automatically." -ForegroundColor Cyan
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host ""

npm start
