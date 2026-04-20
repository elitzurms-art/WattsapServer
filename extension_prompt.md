<div dir="rtl">

# פרומפט להרחבת WhatsApp Bot API

## רקע

יש לי בוט WhatsApp שרץ על שרת (elitzur.ddns.net:1000) עם `whatsapp-web.js` + Puppeteer + Chrome. הבוט נמצא בתיקייה עם המבנה הבא:

```
bot.js              — entry point
api-server.js       — Express REST API (פורט 1000)
chat-bridge.js      — ברידג' לאפליקציה חיצונית
whatsapp.js         — פונקציות עזר (sendWhatsAppButtons, sendWhatsAppText)
handlers/           — מטפלי הודעות
sheets/sessions     — ניהול סשנים ב-Google Sheets
```

האימות: header `x-api-key: <API_KEY>` מול `process.env.API_KEY`.

## המצב הנוכחי

ה-API חושף רק:
- `GET /health` — בדיקת פעילות
- `POST /send` — שליחת הודעת טקסט עם body `{ phone, message, source? }`

## מה לבנות

הוסף את כל הנקודות הבאות ל-`api-server.js`, תוך שימוש ב-API של `whatsapp-web.js`. כל נקודת קצה (למעט `/health`) חייבת לעבור את middleware `authenticate`. שמור על עקביות בפורמט התשובה: `{ ok: true, ... }` או `{ ok: false, error, details? }`.

### 1. שליחה של מדיה

- **`POST /send/image`** — body: `{ phone, imageUrl | imageBase64, caption?, source? }` — שליחת תמונה
- **`POST /send/video`** — body: `{ phone, videoUrl | videoBase64, caption?, source? }` — שליחת וידאו
- **`POST /send/audio`** — body: `{ phone, audioUrl | audioBase64, ptt?, source? }` — שליחת אודיו (`ptt: true` = הודעה קולית)
- **`POST /send/document`** — body: `{ phone, documentUrl | documentBase64, filename, caption?, source? }` — שליחת קובץ (PDF, DOCX וכו')
- **`POST /send/location`** — body: `{ phone, latitude, longitude, description?, source? }` — שליחת מיקום
- **`POST /send/contact`** — body: `{ phone, contactId | contactIds[], source? }` — שליחת איש קשר (VCard)
- **`POST /send/sticker`** — body: `{ phone, stickerUrl | stickerBase64, source? }` — שליחת מדבקה

השתמש ב-`MessageMedia.fromUrl(url)` או `new MessageMedia(mimetype, base64, filename)` ואז `client.sendMessage(chatId, media, options)`.

### 2. פעולות על הודעות קיימות

- **`POST /messages/:messageId/forward`** — body: `{ toPhone | toPhones[] }` — העברת הודעה (עם תגית "הועבר"). שימוש: `msg.forward(chat)`
- **`DELETE /messages/:messageId`** — query: `?everyone=true|false` — מחיקת הודעה (אצלי / אצל כולם). שימוש: `msg.delete(everyone)`
- **`POST /messages/:messageId/react`** — body: `{ emoji }` — הוספת reaction. שימוש: `msg.react(emoji)`
- **`POST /messages/:messageId/reply`** — body: `{ message, mediaUrl?, mediaBase64? }` — תגובה להודעה ספציפית. שימוש: `msg.reply(body, chatId, options)`
- **`GET /messages/:messageId`** — שליפת פרטי הודעה (body, from, timestamp, hasMedia, type)
- **`GET /messages/:messageId/media`** — הורדת מדיה מהודעה → מחזיר `{ mimetype, data: base64, filename }`

הודעה מזוהה לפי `serializedId` (לדוג': `true_972501234567@c.us_3EB0...`). השרת יעבור לפי `client.getMessageById(messageId)`.

### 3. צ'אטים

- **`GET /chats`** — query: `?limit=50&onlyWithUnread=false` — רשימת צ'אטים (name, id, lastMessage, unreadCount, timestamp, isGroup)
- **`GET /chats/:chatId/messages`** — query: `?limit=50&before=<timestamp>` — היסטוריית הודעות מצ'אט
- **`POST /chats/:chatId/markRead`** — סימון נקרא. שימוש: `chat.sendSeen()`
- **`POST /chats/:chatId/markUnread`** — סימון כלא-נקרא. שימוש: `chat.markUnread()`
- **`POST /chats/:chatId/archive`** / **`DELETE /chats/:chatId/archive`** — ארכוב / ביטול ארכוב
- **`POST /chats/:chatId/pin`** / **`DELETE /chats/:chatId/pin`** — נעיצה / ביטול נעיצה
- **`POST /chats/:chatId/mute`** — body: `{ duration: '8h' | '1w' | 'year' | null }` — השתקה
- **`DELETE /chats/:chatId`** — מחיקת צ'אט שלם
- **`POST /chats/:chatId/clear`** — ניקוי היסטוריה

### 4. אנשי קשר

- **`GET /contacts`** — כל אנשי הקשר
- **`GET /contacts/search`** — query: `?name=<שם>` — חיפוש לפי שם (substring, case-insensitive)
- **`GET /contacts/:contactId`** — פרטי איש קשר מלאים (name, pushname, number, isBusiness, isMyContact)
- **`GET /contacts/:contactId/profilePicUrl`** — URL של תמונת פרופיל
- **`GET /contacts/:contactId/about`** — סטטוס/אודות של איש קשר
- **`POST /contacts/:contactId/block`** / **`DELETE /contacts/:contactId/block`** — חסימה / הסרת חסימה

### 5. קבוצות

- **`POST /groups`** — body: `{ name, participants: [phone, ...] }` — יצירת קבוצה
- **`GET /groups/:groupId`** — פרטי קבוצה (name, description, participants, admins, inviteCode)
- **`PATCH /groups/:groupId`** — body: `{ name?, description?, messagesAdminsOnly?, editInfoAdminsOnly? }` — עדכון מאפיינים
- **`POST /groups/:groupId/participants`** — body: `{ phones: [...] }` — הוספת חברים
- **`DELETE /groups/:groupId/participants`** — body: `{ phones: [...] }` — הסרת חברים
- **`POST /groups/:groupId/admins`** — body: `{ phones: [...] }` — מתן הרשאות admin
- **`DELETE /groups/:groupId/admins`** — body: `{ phones: [...] }` — שלילת הרשאות admin
- **`POST /groups/:groupId/picture`** — body: `{ imageUrl | imageBase64 }` — החלפת תמונת קבוצה
- **`GET /groups/:groupId/inviteCode`** — קבלת קישור הזמנה
- **`POST /groups/:groupId/inviteCode/revoke`** — החלפת קישור הזמנה
- **`POST /groups/:groupId/leave`** — יציאה מהקבוצה

### 6. נוכחות וטיפוס

- **`POST /chats/:chatId/typing`** — body: `{ duration: 3000 }` — הצגת "כותב..." למשך זמן
- **`POST /chats/:chatId/recording`** — body: `{ duration: 3000 }` — הצגת "מקליט..."
- **`GET /me`** — פרטי המשתמש המחובר (wid, pushname)
- **`GET /state`** — מצב החיבור (CONNECTED, TIMEOUT, CONFLICT, ...)

### 7. Webhooks (קבלת אירועים נכנסים)

הוסף תמיכה בקבלת אירועים — הבוט ידחוף אירועים ל-URL חיצוני כשהם קורים:

- **`POST /webhooks`** — body: `{ url, events: ['message', 'message_revoke', 'group_join', ...], secret? }` — רישום webhook
- **`GET /webhooks`** — רשימה
- **`DELETE /webhooks/:id`** — הסרה

אירועים לתמיכה: `message`, `message_revoke_everyone`, `message_revoke_me`, `message_reaction`, `group_join`, `group_leave`, `call`, `disconnected`.

כל POST מהבוט ל-webhook יכלול header `x-webhook-signature: <HMAC-SHA256 with secret>` כדי לאמת מקור.

### 8. ניהול סשן

- **`GET /session/qr`** — מחזיר את ה-QR הנוכחי (אם לא מחובר) כ-base64 PNG
- **`POST /session/logout`** — ניתוק ו-logout (מוחק LocalAuth session)
- **`POST /session/restart`** — ריסטארט רך של ה-client

## הנחיות איכות

1. **שמירה על תבניות קיימות** — rate limiting, authentication middleware, error handling (try/catch עם `res.status(...).json(...)`).
2. **ולידציה** — לכל endpoint ודא שפרמטרים חובה קיימים, החזר `400` עם הודעה ברורה אם לא.
3. **נרמול מספרי טלפון** — השתמש ב-`normalizePhone` הקיים מ-`./sheets/helpers`.
4. **טיפול בשגיאות whatsapp-web.js** — המר הודעות פנימיות ("No LID for user", "Evaluation failed") לטקסט ידידותי: `{ error: 'Recipient not on WhatsApp', details: ... }`.
5. **תיעוד** — הוסף README.md עם טבלת endpoints, דוגמאות `curl`, ודוגמאות body.
6. **אל תשבור תאימות לאחור** — אסור לשנות את התנהגות `/send` או `/health`.
7. **ללא מבנה תיקיות חדש** — תמיד הוסף את הלוגיקה ל-`api-server.js` (או פצל ל-`routes/` אם זה מתארך מאוד, אבל שמור ייבוא נקי).

## בדיקות סופיות

ודא שהתשובות מעמידות את ה-pattern הבא:

- ✅ הצלחה: `{ ok: true, <payload>, timestamp }`
- ❌ כישלון: `{ ok: false, error: '<קצר>', details?: '<ארוך>' }`
- אי-הרשאה: 403 עם `{ ok: false, error: 'Unauthorized' }`
- rate limit: 429 עם `{ ok: false, error: 'Rate limit exceeded...' }`
- פרמטר חסר: 400
- פעולה נכשלה בתוך whatsapp-web.js: 500

## מה לאחר מכן

אחרי שה-API הורחב, אעדכן את ה-MCP server (`C:/MCP_WhatsApp/whatsapp_server.py`) להוסיף כלים מקבילים (`send_image`, `forward_message`, `search_contacts`, `delete_message` וכו') כדי שכל זה יהיה זמין דרך Claude Code.

</div>
