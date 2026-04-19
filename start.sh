#!/bin/bash

# מעבר לתיקייה שבה נמצא הסקריפט
cd "$(dirname "$0")"

while true
do
    echo "========================================"
    echo "Starting WattsapServer Bot"
    echo "Time: $(date)"
    echo "========================================"
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
