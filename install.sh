#!/bin/bash

# מעבר לתיקייה של הסקריפט
cd "$(dirname "$0")"

echo "========================================"
echo "WattsapServer Installation Script (macOS)"
echo "========================================"
echo ""

# בדיקת Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install it via: brew install node (or visit nodejs.org)"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"

# בדיקת npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed!"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "npm version: $NPM_VERSION"

# בדיקת pnpm
PNPM_INSTALLED=0
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm -v)
    echo "pnpm version: $PNPM_VERSION"
    PNPM_INSTALLED=1
else
    echo "pnpm is not installed (will use npm)"
fi

# בדיקת node_modules קיימים
if [ -d "node_modules" ]; then
    read -p "node_modules already exists! Reinstall? (y/n): " REINSTALL
    if [[ $REINSTALL != "y" ]]; then
        echo "Skipping installation..."
    else
        echo "Cleaning old files..."
        rm -rf node_modules .cache .wwebjs_auth .wwebjs_cache pnpm-lock.yaml package-lock.json latest_chrome
    fi
fi

# סגירת כרום (אופציונלי במאק, עלול לסגור דפדפן פעיל של המשתמש)
echo "Note: Skipping Chrome termination to avoid closing your browser."

# התקנת חבילות
if [ $PNPM_INSTALLED -eq 1 ]; then
    echo "Using pnpm..."
    pnpm store prune
    pnpm install
    pnpm install express body-parser
else
    echo "Using npm..."
    npm cache clean --force
    npm install
    npm install express body-parser
fi

# הגדרת Puppeteer Chrome
echo "Checking Puppeteer Chrome setup..."
# במאק הנתיב של Puppeteer שונה (mac_arm64 או mac_x64)
CACHE_DIR=".cache/puppeteer/chrome"

if [ ! -d "latest_chrome" ]; then
    # חיפוש תיקיית הכרום שהורדה
    VERSION_DIR=$(find "$CACHE_DIR" -type d -name "mac*" | head -n 1)
    
    if [ -n "$VERSION_DIR" ]; then
        echo "Found Chrome version: $VERSION_DIR"
        # יצירת קישור סימבולי (במאק משתמשים ב-ln -s)
        ln -s "$VERSION_DIR" "latest_chrome"
        echo "Static link created: latest_chrome"
    else
        echo "WARNING: Chrome not found. Running: npx puppeteer browsers install chrome"
        npx puppeteer browsers install chrome
    fi
fi

echo ""
echo "========================================"
echo "Setup finished successfully!"
echo "========================================"
echo "Run the bot with: node bot.js"
