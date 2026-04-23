#!/bin/bash

# מעבר לתיקייה שבה נמצא הסקריפט
cd "$(dirname "$0")"

SESSION_DIR="$(pwd)/.wwebjs_auth/session"

cleanup() {
    echo "🧹 Cleanup: killing leftover puppeteer Chrome + stale locks"
    pkill -9 -f ".cache/puppeteer.*Chrome" 2>/dev/null
    pkill -9 -f "Chrome for Testing" 2>/dev/null
    rm -f "$SESSION_DIR/SingletonLock" \
          "$SESSION_DIR/SingletonSocket" \
          "$SESSION_DIR/SingletonCookie"
    sleep 1
}

while true
do
    echo "========================================"
    echo "Starting WattsapServer Bot"
    echo "Time: $(date)"
    echo "========================================"

    cleanup
    echo ""

    # הרצת הבוט
    node bot.js

    echo ""
    echo "========================================"
    echo "Bot stopped! Exit code: $?"
    echo "Restarting in 5 seconds..."
    echo "Press Ctrl+C to stop"
    echo "========================================"
    echo ""

    sleep 5
done
