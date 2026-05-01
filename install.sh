#!/usr/bin/env bash
set -e

echo ""
echo "============================================"
echo " VTU Automator — Quick Install (Linux/Mac)"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js is not installed."
  echo ""
  echo "  Install Node.js v18+ from: https://nodejs.org"
  echo "  Or via nvm: https://github.com/nvm-sh/nvm"
  echo ""
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[ERROR] Node.js v18 or newer is required. You have $(node -v)."
  echo "  Download the latest from https://nodejs.org"
  exit 1
fi

echo "[OK] Node.js $(node -v) found."
echo ""

# Install npm packages
echo "Installing dependencies..."
npm install --silent
echo "[OK] Dependencies installed."
echo ""

# Install Playwright browsers
echo "Installing Playwright browser (this may take a minute)..."
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
echo "[OK] Browser ready."
echo ""

echo "============================================"
echo " Starting VTU Automator..."
echo " Your browser will open automatically."
echo "============================================"
echo ""

npm start
