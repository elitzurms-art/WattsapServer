# WattsapServer - בוט גמ"ח סקי

בוט WhatsApp לניהול השאלת ציוד סקי (מעילים, מכנסיים, ופריטים נוספים).

## התקנה

```bash
# 1. שכפול הפרויקט
git clone <repository-url>
cd WattsapServer

# 2. התקנת תלויות (הפאטצ'ים יוחלו אוטומטית)
pnpm install

# 3. הגדרת credentials לGoogle API
# העתק את credentials.json.example ל-credentials.json
# ומלא את הפרטים מ-Google Cloud Console
cp credentials.json.example credentials.json

# 4. הרצה
node bot.js
```

## תכונות

- ניהול השאלת ציוד (מעילים, מכנסיים, נוספים)
- מערכת שריונות עם תאריכים
- סטטוס משולב: מושאל+משוריין
- תזכורות החזרה
- אינטגרציה עם Google Sheets
- ניהול משתמשים דרך טלפון

## קבצים חשובים

- `bot.js` - קובץ ראשי
- `handlers/index.js` - לוגיקת הבוט
- `sheets/inventory.js` - אינטגרציה עם Google Sheets
- `credentials.json` - אישורים לGoogle API (לא בגיט!)
- `patches/` - תיקונים לספריות חיצוניות

## הערות

- הפאטץ' ל-whatsapp-web.js יוחל אוטומטית אחרי `pnpm install`
- לא לשכוח להוסיף `credentials.json` למיקום הנכון
