// helpers.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('../credentials.json');

const SPREADSHEET_ID = '1npVI1XUaTJDzkhPoeUapW5pqfq-wz9czW6b8whO1qSo';

// מאפשר TEST / PROD
const SESSIONS_SHEET_NAME =
    process.env.SESSIONS_SHEET || 'Sessions';

let doc = null;

// ===============================
// חיבור ל־Google Sheets (v4+)
// ===============================
async function getDoc() {
    if (doc) return doc;

    const serviceAccountAuth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const spreadsheet = new GoogleSpreadsheet(
        SPREADSHEET_ID,
        serviceAccountAuth
    );

    await spreadsheet.loadInfo();
    doc = spreadsheet;
    return doc;
}

// ===============================
// נרמול טלפון
// ===============================
function normalizePhone(phone) {
    if (!phone) return '';

    phone = phone.toString().trim();

    // אם כבר כולל @c.us או @g.us → נשאר כמו שהוא
    if (phone.includes('@g.us')) return phone;

    // הסרת כל תווים שאינם ספרות
    let normalized = phone.replace(/\D/g, '');

    // טיפול במספרים ישראליים
    if (normalized.startsWith('0') && normalized.length === 10) {
        normalized = '972' + normalized.substring(1);
    } else if (!normalized.startsWith('972') && normalized.length === 9) {
        normalized = '972' + normalized;
    }
	
    return normalized;
}

// ===============================
// וידוא המסדים שנשלחו בהתאם לפורמט
// ===============================
function validateSelection(inputText, allItems, phone) {
    // 1. הפיכת הקלט למחרוזת וחילוץ מספרים
    const rawText = String(inputText || '');
    const extractedNumbers = rawText.match(/\d+/g) || [];
    
    // 2. סינון למספרים בני 3 ספרות בדיוק
    const requestedIds = [...new Set(extractedNumbers.filter(num => num.length === 3))];

    if (extractedNumbers.length > 0 && requestedIds.length === 0) {
        return {
            valid: [],
            message: '❌ המספרים ששלחת אינם תקינים. יש לשלוח מספרי מס"ד בני 3 ספרות (לדוגמה: 320 321).'
        };
    }

    if (requestedIds.length === 0) {
        return {
            valid: [],
            message: 'לא נמצאו מספרי פריטים בהודעה.'
        };
    }

    // 3. איחוד פריטים למערך שטוח
    let flatList = [];
    if (Array.isArray(allItems)) {
        flatList = allItems;
    } else if (allItems && typeof allItems === 'object') {
        flatList = [
            ...(allItems.coats || []),
            ...(allItems.pants || []),
            ...(allItems.additional || [])
        ];
    }

    // 4. יצירת מפה להשוואה מהירה
    const itemMap = {};
    flatList.forEach(item => {
        if (item && item.id) {
            itemMap[String(item.id).trim()] = item;
        }
    });

    const validItems = [];
    const invalidIds = [];
    const alreadyReservedByMe = [];

    // 5. בדיקה מול הרשימה עם זיהוי שריון כפול אישי
    requestedIds.forEach(id => {
        const item = itemMap[id];
        if (item) {
            // 🔥 עדכון: בדיקה אם המשתמש מנסה לבחור פריט שכבר משוריין עליו
            const allPhones = String(item.phoneWattsap || '').split(',').map(p => p.trim());
            const isMine = allPhones.some(p => p && (p === phone || p.includes(phone)));
            
            if (isMine && item.status === 'משוריין') {
                alreadyReservedByMe.push(id);
            }
            validItems.push(item);
        } else {
            invalidIds.push(id);
        }
    });

    // 6. החזרת הודעות שגיאה מותאמות
    if (invalidIds.length > 0) {
        return {
            valid: [],
            message: `פריט/ים מספר ${invalidIds.join(', ')} לא נמצאו ברשימה הזמינה או שהם תפוסים.`
        };
    }

    return { valid: validItems };
}





module.exports = {
    getDoc,
    normalizePhone,
    SESSIONS_SHEET_NAME,
	validateSelection
};
