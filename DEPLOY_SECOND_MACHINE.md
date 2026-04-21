<div dir="rtl">

# פריסה במחשב השני (איפה שהבוט רץ)

אחרי כל `git push` בבראנץ' `main`, יש לרוץ על המחשב שבו הבוט פועל:

```bash
cd C:/MCP_WhatsApp
git pull
npx patch-package     # מפעיל את patches/whatsapp-web.js+1.34.6.patch
# restart לבוט (pm2 restart whatsapp-bot --update-env או start.sh מחדש)
```

## למה צריך `npx patch-package`?

התיקיה `node_modules/whatsapp-web.js/` מגיעה מ-npm ולא מ-git (`node_modules` ב-`.gitignore`). כדי שהתיקונים שלנו ל-whatsapp-web.js יחולו בכל פעם מחדש, הם נשמרים כפאץ׳ בתיקייה `patches/` ו-patch-package מיישם אותם על node_modules.

אם מריצים `npm install` במקום, patch-package ירוץ אוטומטית ב-postinstall.

## אימות שהתיקון הוחל

```bash
grep "WAWebChatLoadMessages" node_modules/whatsapp-web.js/src/structures/Chat.js
```
צריך להחזיר שורה עם `window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat })`.

## סדר פעולות אחרי פאץ׳ חדש

1. `git pull`
2. `npx patch-package` (או `npm install`)
3. restart מלא לבוט — לא רק soft-restart של ה-MCP, אלא גם הפלת התהליך והרמתו מחדש (puppeteer צריך frame חדש)

</div>
