# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WattsapServer** is a WhatsApp bot for managing a ski equipment lending library ("גמ"ח סקי בגולן"). The bot handles borrowing, returning, and reserving ski equipment (coats, pants, goggles, etc.) through WhatsApp conversations with users. All inventory and session data is stored in Google Sheets.

## Commands

### Running Tests
```bash
# Run all tests
npx jest

# Run specific test suite
npx jest tests/flow.simulation.test.js

# Run with watch mode
npx jest --watch
```

### Package Management
```bash
# Install dependencies
pnpm install

# Apply patches (runs automatically after install)
npx patch-package
```

### Utilities
```bash
# Kill Chrome instances (used for cleanup)
taskkill /F /IM chrome.exe /T
```

## Architecture

### State Machine Flow
The bot operates as a conversational state machine. User sessions track the current state and transition through these states:

- `ANUNIMI` - Initial/anonymous state (no active session)
- `BORROW_RETURN_SELECT` - User selecting between borrow/return/reserve/cancel
- `BORROW_SELECT` - User selecting items to borrow
- `RETURN_SELECT` - User selecting items to return
- `RESERVE_SELECT` - User selecting items to reserve
- `RESERVE_DATE` - Waiting for date confirmation for reservation
- `RESERVE_DATES_CONFIRM` - User entering reservation dates
- `BORROW_CONFIRM`, `RETURN_CONFIRM`, `RESERVE_CONFIRM` - Final confirmation states

State transitions are handled in `handlers/index.js` through a switch statement on `session.state`.

### Data Storage Strategy
The system uses Google Sheets as the database with two available session management approaches:

1. **In-Memory Sessions** (`sheets/sessions.js`) - Default approach
   - Sessions stored in JavaScript memory with 30-minute TTL
   - Faster performance, no Google Sheets API calls for sessions
   - Sessions cleared automatically after timeout
   - Data lost on server restart

2. **Google Sheets Sessions** (`sheets/sessionsForAppsScript.js`)
   - Sessions persisted to Google Sheets "Sessions" tab
   - Survives server restarts
   - Slower due to API round-trips
   - Can be inspected/modified directly in spreadsheet

**Inventory Data** is always stored in Google Sheets under the "ניהול" (Management) tab. Responses/transactions are logged to the "תגובות" (Responses) tab.

### Module Responsibilities

**`handlers/index.js`** - Core message handler and state machine
- `handleMessage()` - Main entry point, routes to state-specific handlers
- `startSession()` - Initiates new conversation
- `handle_Borrow_Return_Select()` - Handles main menu selection
- `handleBorrowSelect()`, `handleReturnSelect()`, `handleReserveSelect()` - Display available items
- `choice()` - Validates user selections and shows confirmation
- `reserveDates()`, `handleReserveDatesConfirm()` - Handle reservation date logic
- `accept()` - Final confirmation and transaction processing

**`sheets/inventory.js`** - Inventory management
- `getAvailableItems()` - Returns items with status "במלאי" or "משוריין"
- `getBorrowedItemsByPhone()` - Returns items borrowed/reserved by specific user
- `hasDateOverlap()` - Checks if reservation dates conflict with existing reservations
- `addResponse()` - Writes transaction to "תגובות" sheet

**`sheets/sessions.js`** - Session management (in-memory)
- Uses JavaScript object as session store
- 30-minute TTL with automatic cleanup via `setTimeout`

**`sheets/helpers.js`** - Shared utilities
- `getDoc()` - Google Sheets authentication and connection (singleton pattern)
- `normalizePhone()` - Strips non-digits from phone numbers for consistent comparison
- `validateSelection()` - Validates user input for item selection (3-digit IDs)

**`sheets/whatsapp.js`** - WhatsApp message utilities
- `sendWhatsAppButtons()` - Sends interactive button lists (with text fallback)
- `sendWhatsAppText()` - Sends plain text messages

### Key Data Structures

**Item Object**:
```javascript
{
  id: "305",           // 3-digit item ID
  name: "מעיל | מידה: L | צבע: אדום",
  status: "במלאי" | "מושאל" | "משוריין" | "מושאל+משוריין",
  phoneWattsap: "972123456789,972987654321", // Comma-separated (first=borrower in "מושאל+משוריין", rest=reservers)
  nameWattsap: "User Name(s)",
  reserveFrom: "01/02/2026,15/02/2026",      // Comma-separated dates
  reserveTo: "07/02/2026,21/02/2026",
  reserveReturnBy: "31/01/2026"              // Calculated: day before first reservation
}
```

**Session Object**:
```javascript
{
  state: "BORROW_SELECT",
  payload: "305,310##305 - מעיל אדום | 310 - מכנס כחול", // "ids##names" format
  reserveFrom: "01/02/2026",
  reserveTo: "07/02/2026"
}
```

### Multi-User Reservations
The system supports multiple users reserving the same item for different date ranges:
- Phone numbers stored as comma-separated list: `"phone1,phone2"`
- Corresponding dates stored as comma-separated lists: `"01/02/26,15/02/26"`
- Index matching: phone[i] corresponds to reserveFrom[i] and reserveTo[i]
- `hasDateOverlap()` checks all date ranges to prevent conflicts

### Date Validation Rules (reservations)
1. End date must be after start date
2. Start date must be at least 3 days from today
3. End date cannot exceed 3 months from today
4. Reservation duration cannot exceed 14 days
5. Must not overlap with existing reservations for the same item

### Phone Number Normalization
All phone numbers are normalized using `normalizePhone()` which strips non-digit characters. This ensures consistent comparisons across:
- User messages (`msg.from`)
- Google Sheets data
- Session lookups
- Multi-user reservation matching

## Configuration

- **Google Sheets ID**: Stored in `sheets/helpers.js` as `SPREADSHEET_ID`
- **Service Account Credentials**: `credentials.json` (not committed)
- **Session Sheet Name**: Configurable via `process.env.SESSIONS_SHEET` (default: "Sessions")

## Google Sheets Structure

### "תגובות" (Responses) Sheet Columns
The `addResponse()` function writes transaction logs with these columns (in order):
1. חותמת זמן - Timestamp
2. פעולה - Action type (שאילת ציוד / החזרת ציוד / שריון ציוד)
3. שם - User name
4. טלפון - Phone number
5. תאריך החזרה צפוי - Expected return date
6. מעילים שאולים - Borrowed coats (,ID1,ID2,)
7. מכנסיים שאולים - Borrowed pants
8. פריטים נוספים שאולים - Borrowed additional items
9. פריטים מוחזרים - Returned items
10. פריטים משוריינים - Reserved items
11. שריון מתאריך - Reservation start date
12. שריון עד תאריך - Reservation end date
13. ביטול שריון - Cancelled reservations

**Important**: The code uses column names (via `sheet.addRow(object)`) not indexes, so column order in the sheet doesn't matter as long as headers match.

## Testing

Tests use Jest with mocked Google Sheets and WhatsApp clients. Mock implementations are in `tests/__mocks__/`:
- `client.mock.js` - Mock WhatsApp client
- `msg.mock.js` - Mock message objects
- `helpers.js`, `sessions.js`, `inventory.js` - Mock sheet operations

## Patches

A patch is applied via `patch-package` to fix a crash in `whatsapp-web.js` related to `sendSeen()`. The patch disables the "mark as read" functionality to prevent errors.

File: `patches/whatsapp-web.js+sendSeen-noop.patch`

## Important Notes

- All user-facing text is in Hebrew (RTL)
- Item IDs are always 3 digits
- User selections can be comma or space-separated: "305,310" or "305 310"
- The system automatically cancels personal reservations when a user borrows their reserved items
- Status values in Google Sheets:
  - "במלאי" (available)
  - "מושאל" (borrowed)
  - "משוריין" (reserved)
  - "מושאל+משוריין" (currently borrowed AND has future reservation)
- When status is "מושאל+משוריין": first phones in list are future reservers (with dates), last phone is current borrower (no dates)
- Status is calculated dynamically via Google Sheets formulas based on "תגובות" sheet
- Date format is DD/MM/YYYY or DD/MM/YY (auto-expanded to 20YY)
