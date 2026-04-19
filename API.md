# WhatsApp Bot REST API

Base URL: `http://elitzur.ddns.net:1000` (local: `http://localhost:1000`)

## Authentication

Every endpoint except `GET /health` requires the header:

```
x-api-key: <API_KEY>
```

The key is read from `process.env.API_KEY`.

## Response shape

- Success: `{ "ok": true, ...payload, "timestamp": "..." }`
- Failure: `{ "ok": false, "error": "<short>", "details": "<long>" }`
- 403: unauthorized · 429: rate-limited · 400: missing/invalid params · 404: not found · 500: WhatsApp-side failure.

## Identifiers

- **phone**: Israeli format (e.g. `0501234567`) or E.164 (e.g. `972501234567`). Auto-normalized.
- **chatId**: `<digits>@c.us` (private) or `<digits>@g.us` (group). Endpoints that take `:chatId` accept the full serialized id.
- **messageId**: `serializedId` returned by WhatsApp (e.g. `true_972501234567@c.us_3EB0...`).

---

## Endpoints

### Health / core

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness check (no auth) |
| POST | `/send` | `{ phone, message, source? }` | Legacy text send (unchanged) |
| GET | `/me` | — | Logged-in user (`wid`, `pushname`, `platform`) |
| GET | `/state` | — | Connection state (`CONNECTED`, `TIMEOUT`, ...) |

### Media send

| Method | Path | Body |
|---|---|---|
| POST | `/send/image` | `{ phone, imageUrl \| imageBase64, mimetype?, caption?, filename? }` |
| POST | `/send/video` | `{ phone, videoUrl \| videoBase64, mimetype?, caption? }` |
| POST | `/send/audio` | `{ phone, audioUrl \| audioBase64, mimetype?, ptt? }` |
| POST | `/send/document` | `{ phone, documentUrl \| documentBase64, mimetype?, filename, caption? }` |
| POST | `/send/sticker` | `{ phone, stickerUrl \| stickerBase64 }` |
| POST | `/send/location` | `{ phone, latitude, longitude, description? }` |
| POST | `/send/contact` | `{ phone, contactId \| contactIds }` |

### Messages

| Method | Path | Body / Query |
|---|---|---|
| GET | `/messages/:messageId` | — |
| GET | `/messages/:messageId/media` | — → `{ mimetype, data, filename }` |
| POST | `/messages/:messageId/forward` | `{ toPhone \| toPhones }` |
| DELETE | `/messages/:messageId` | `?everyone=true\|false` |
| POST | `/messages/:messageId/react` | `{ emoji }` (empty string clears) |
| POST | `/messages/:messageId/reply` | `{ message?, mediaUrl?, mediaBase64?, mimetype?, filename?, caption? }` |

### Chats

| Method | Path | Body / Query |
|---|---|---|
| GET | `/chats` | `?limit=50&onlyWithUnread=false` |
| GET | `/chats/:chatId/messages` | `?limit=50&before=<timestamp>` |
| POST | `/chats/:chatId/markRead` | — |
| POST | `/chats/:chatId/markUnread` | — |
| POST / DELETE | `/chats/:chatId/archive` | — |
| POST / DELETE | `/chats/:chatId/pin` | — |
| POST | `/chats/:chatId/mute` | `{ duration: '8h' \| '1w' \| 'year' \| null }` |
| DELETE | `/chats/:chatId` | — |
| POST | `/chats/:chatId/clear` | — |
| POST | `/chats/:chatId/typing` | `{ duration: 3000 }` |
| POST | `/chats/:chatId/recording` | `{ duration: 3000 }` |

### Contacts

| Method | Path | Body / Query |
|---|---|---|
| GET | `/contacts` | — |
| GET | `/contacts/search` | `?name=<substring>` |
| GET | `/contacts/:contactId` | — |
| GET | `/contacts/:contactId/profilePicUrl` | — |
| GET | `/contacts/:contactId/about` | — |
| POST / DELETE | `/contacts/:contactId/block` | — |

### Groups

| Method | Path | Body |
|---|---|---|
| POST | `/groups` | `{ name, participants: [phone,...] }` |
| GET | `/groups/:groupId` | — |
| PATCH | `/groups/:groupId` | `{ name?, description?, messagesAdminsOnly?, editInfoAdminsOnly? }` |
| POST / DELETE | `/groups/:groupId/participants` | `{ phones: [...] }` |
| POST / DELETE | `/groups/:groupId/admins` | `{ phones: [...] }` |
| POST | `/groups/:groupId/picture` | `{ imageUrl \| imageBase64, mimetype? }` |
| GET | `/groups/:groupId/inviteCode` | — |
| POST | `/groups/:groupId/inviteCode/revoke` | — |
| POST | `/groups/:groupId/leave` | — |

### Webhooks

| Method | Path | Body |
|---|---|---|
| GET | `/webhooks` | list |
| POST | `/webhooks` | `{ url, events: [...], secret? }` |
| DELETE | `/webhooks/:id` | remove |

Supported events: `message`, `message_revoke_everyone`, `message_revoke_me`, `message_reaction`, `group_join`, `group_leave`, `call`, `disconnected`.

Each outgoing POST includes header `x-webhook-signature: <HMAC-SHA256(body, secret)>` when a secret is set. Body shape: `{ event, payload, timestamp }`.

> In-memory registration — cleared on server restart. Re-register on startup.

### Session

| Method | Path | Body |
|---|---|---|
| GET | `/session/qr` | Current QR (raw string + `imageDataUrl` if `qrcode` package installed) |
| POST | `/session/logout` | Logs out, clears LocalAuth |
| POST | `/session/restart` | Soft restart via `process.exit(0)` — requires a supervisor (PM2/nodemon) |

> For PNG responses install the optional dep: `pnpm add qrcode`.

---

## Examples

### Send image by URL

```bash
curl -X POST http://localhost:1000/send/image \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone":"0501234567","imageUrl":"https://picsum.photos/400","caption":"שלום"}'
```

### Send PTT (voice) audio by base64

```bash
curl -X POST http://localhost:1000/send/audio \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone":"0501234567","audioBase64":"...","mimetype":"audio/ogg; codecs=opus","ptt":true}'
```

### React to a message

```bash
curl -X POST "http://localhost:1000/messages/true_972...@c.us_3EB0.../react" \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"emoji":"👍"}'
```

### Register a webhook

```bash
curl -X POST http://localhost:1000/webhooks \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/wh","events":["message","message_reaction"],"secret":"shh"}'
```

### Fetch current QR

```bash
curl -H "x-api-key: $API_KEY" http://localhost:1000/session/qr
```
