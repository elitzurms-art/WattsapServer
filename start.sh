#!/bin/bash

# מעבר לתיקייה שבה נמצא הסקריפט
cd "$(dirname "$0")"

SESSION_DIR="$(pwd)/.wwebjs_auth/session"
BOT_PORT=1000

BOT_PID=""

on_term() {
    echo ""
    echo "🛑 Received termination signal — stopping bot.js (PID $BOT_PID)"
    if [ -n "$BOT_PID" ] && kill -0 "$BOT_PID" 2>/dev/null; then
        kill -TERM "$BOT_PID" 2>/dev/null
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "$BOT_PID" 2>/dev/null || break
            sleep 1
        done
        kill -9 "$BOT_PID" 2>/dev/null
    fi
    exit 0
}
trap on_term SIGTERM SIGINT

cleanup() {
    echo "🧹 Cleanup: killing leftover puppeteer Chrome + stale locks + port $BOT_PORT holders"
    pkill -9 -f ".cache/puppeteer.*Chrome" 2>/dev/null
    pkill -9 -f "Chrome for Testing" 2>/dev/null
    # הריגת כל מי שמחזיק את פורט 1000 (תהליכי bot.js יתומים, connections תקועים וכד')
    holders=$(lsof -ti tcp:$BOT_PORT 2>/dev/null)
    if [ -n "$holders" ]; then
        echo "   Found process(es) on port $BOT_PORT: $holders — killing"
        echo "$holders" | xargs kill -9 2>/dev/null
    fi
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

    # הרצת הבוט ברקע + wait כדי שהסיגנלים יגיעו ל-trap
    node bot.js &
    BOT_PID=$!
    wait "$BOT_PID"
    EXIT_CODE=$?
    BOT_PID=""

    echo ""
    echo "========================================"
    echo "Bot stopped! Exit code: $EXIT_CODE"
    echo "Restarting in 5 seconds..."
    echo "Press Ctrl+C to stop"
    echo "========================================"
    echo ""

    sleep 5
done
