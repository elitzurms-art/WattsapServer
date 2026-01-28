// inventory.js
const { getDoc, normalizePhone } = require('./helpers');

// ===============================
// פריטים זמינים להשאלה
// ===============================
async function getAvailableItems() {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['ניהול'];
        if (!sheet) {
            console.warn('⚠️ גיליון "ניהול" לא נמצא');
            return { coats: [], pants: [], additional: [] };
        }

		// הגבלתי ל200 שורות, אם רוצים אפשר להגדיל
        const rows = await sheet.getRows({ limit: 200 });
        const coats = [], pants = [], additional = [];

        rows.forEach((row, index) => {
            const status = (row.get('סטטוס') || '').trim();
            // תמיכה בסטטוס משולב: מושאל+משוריין
            if (status !== 'במלאי' && status !== 'משוריין' && status !== 'מושאל+משוריין') return;

            const type = (row.get('סוג') || '').trim();
            const rawId = row.get('מס"ד');
            const id = (rawId !== undefined && rawId !== null && rawId !== '') ? String(rawId) : `item_${index}`;

            // שליפת השדות מהגיליון (כולל הרשימות המאוחדות)
            const nameWattsap = row.get('שם') || ""; // עודכן לשם העמודה בגיליון
            const phoneWattsap = row.get('טלפון') || ""; 

            const reserveFrom = row.get('תאריך תחילת שיריון') || '';
            const reserveTo = row.get('תאריך סיום שיריון') || '';
			
			// פיצול רשימת התאריכים ושליחת התאריך הראשון בלבד לחישוב
			const firstReserveDate = reserveFrom.split(',')[0].trim();
			const reserveReturnBy = ((status === 'משוריין' || status === 'מושאל+משוריין') && firstReserveDate) ? getDayBefore(firstReserveDate) : null;

            const item = {
                id: id,
                name: `${type} | מידה: ${row.get('מידה') || ''} | צבע: ${row.get('צבע') || ''}`.replace(/\s+/g, ' ').trim(),
                status: status,
                reserveFrom: reserveFrom,
                reserveTo: reserveTo,
                reserveReturnBy: reserveReturnBy,
                nameWattsap: String(nameWattsap),
                // ניקוי רווחים מהטלפונים כדי למנוע בעיות בהשוואה בהמשך
                phoneWattsap: String(phoneWattsap).replace(/\s/g, '') 
            };

            if (type.includes('מעיל')) coats.push(item);
            else if (type.includes('מכנס')) pants.push(item);
            else additional.push(item);
        });

        return { coats, pants, additional };
    } catch (err) {
        console.error('❌ getAvailableItems error:', err);
        return { coats: [], pants: [], additional: [] };
    }
}


// ===============================
// פריטים מושאלים לפי טלפון
// ===============================
async function getBorrowedItemsByPhone(phone) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['ניהול'];
        if (!sheet) {
            console.warn('⚠️ גיליון "ניהול" לא נמצא');
            return { coats: [], pants: [], additional: [] };
        }

		// הגבלתי ל200 שורות, אם רוצים אפשר להגדיל
        const rows = await sheet.getRows({ limit: 200 });
        const userPhone = normalizePhone(phone || '');

        const coats = [];
        const pants = [];
        const additional = [];

        rows.forEach((row, index) => {
            const status = (row.get('סטטוס') || '').trim();

            // אנחנו מציגים למשתמש את מה שמושאל עליו או משוריין עליו
            // תמיכה גם בסטטוס משולב
            if (status !== 'מושאל' && status !== 'משוריין' && status !== 'מושאל+משוריין') return; 

            // 🔥 עדכון קריטי: טיפול ברשימת טלפונים (עקב שריון כפול)
            const rawPhones = String(row.get('טלפון') || '');
            const allPhones = rawPhones.split(',').map(p => normalizePhone(p.trim()));
			
            // בדיקה האם הטלפון של המשתמש נמצא בתוך רשימת הטלפונים של השורה
            if (!allPhones.includes(userPhone)) return;

            const type = (row.get('סוג') || '').trim();
            const rawId = row.get('מס"ד');
            const id = (rawId !== undefined && rawId !== null && rawId !== '') ? String(rawId) : `item_${index}`;

            const nameWattsap = row.get('שם השואל/ משריין') || "";
            const reserveFrom = row.get('תאריך תחילת שיריון') || '';
            const reserveTo = row.get('תאריך סיום שיריון') || '';
			
			// פיצול רשימת התאריכים ושליחת התאריך הראשון בלבד לחישוב
			const firstReserveDate = reserveFrom.split(',')[0].trim();
			const reserveReturnBy = ((status === 'משוריין' || status === 'מושאל+משוריין') && firstReserveDate) ? getDayBefore(firstReserveDate) : null;

            const item = {
                id: id,
                name: `${type} | מידה: ${row.get('מידה') || ''} | צבע: ${row.get('צבע') || ''}`.replace(/\s+/g, ' ').trim(),
                status: status,
                reserveFrom: reserveFrom,
                reserveTo: reserveTo,
                reserveReturnBy: reserveReturnBy,
                nameWattsap: nameWattsap,
                phoneWattsap: rawPhones // שומר את הרשימה המלאה לצרכי השוואת אינדקסים בהמשך
            };

            if (type.includes('מעיל')) coats.push(item);
            else if (type.includes('מכנס')) pants.push(item);
            else additional.push(item);
        });

        return { coats, pants, additional };

    } catch (err) {
        console.error('❌ getBorrowedItemsByPhone error:', err);
        return { coats: [], pants: [], additional: [] };
    }
}


// חישוב החזרת פריט משוריין
function getDayBefore(dateInput) {
    if (!dateInput) return null;

    // תמיכה בפורמט DD/MM/YYYY
    const match = dateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    // יצירת אובייקט תאריך
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return null;

    // הפחתת יום אחד
    d.setDate(d.getDate() - 1);

    // החזרה בפורמט DD/MM/YYYY קשיח (כדי למנוע נקודות של he-IL)
    const d2 = String(d.getDate()).padStart(2, '0');
    const m2 = String(d.getMonth() + 1).padStart(2, '0');
    const y2 = d.getFullYear();

    return `${d2}/${m2}/${y2}`;
}


// פונקציית עזר להמרת מחרוזת תאריך (DD/MM/YYYY) לאובייקט Date
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    // יצירת אובייקט תאריך
    const d = new Date(year, month - 1, day);

    // בדיקה שהתאריך חוקי:
    // ב-JS, אם תיתן יום 33, הוא יקפוץ אוטומטית לחודש הבא. 
    // לכן בודקים אם היום, החודש והשנה נשארו זהים למה שהכנסנו.
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
        return d;
    }
    
    return null; // תאריך לא תקין (כמו 33/01)
}


// בדיקת חפיפה בין טווח מבוקש לרשימת שריונים קיימת בגיליון הניהול
function hasDateOverlap(item, reqStartStr, reqEndStr) {
    const reqStart = parseDate(reqStartStr);
    const reqEnd = parseDate(reqEndStr);

    // אם הפריט לא משוריין בכלל, אין חפיפה
    if (item.status !== 'משוריין' || !item.reserveFrom) return false;

    // פירוק רשימות התאריכים (תומך גם בתאריך בודד וגם ברשימה עם פסיקים)
    const allStarts = String(item.reserveFrom).split(',').filter(s => s.trim());
    const allEnds = String(item.reserveTo).split(',').filter(e => e.trim());

    for (let i = 0; i < allStarts.length; i++) {
        const existingStart = parseDate(allStarts[i]);
        const existingEnd = parseDate(allEnds[i]);

        if (existingStart && existingEnd) {
            // לוגיקת חפיפה: (התחלה א <= סיום ב) וגם (סיום א >= התחלה ב)
            if (reqStart <= existingEnd && reqEnd >= existingStart) {
                return true; // נמצאה חפיפה
            }
        }
    }
    return false;
}


// רישום תגובה סופית לגיליון "תגובות"
async function addResponse(data) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['תגובות'];
        if (!sheet) throw new Error('גיליון תגובות לא נמצא');

        const now = new Date();
        const formattedDate =
            ("0" + now.getDate()).slice(-2) + "/" +
            ("0" + (now.getMonth() + 1)).slice(-2) + "/" +
            now.getFullYear() + " " +
            ("0" + now.getHours()).slice(-2) + ":" +
            ("0" + now.getMinutes()).slice(-2) + ":" +
            ("0" + now.getSeconds()).slice(-2);

        // --- לוגיקת ביטול שריון אוטומטי בעת שאילה ---
        let finalReserveCancel = data.reserveItemsCancel || '';

        // אם זו פעולת שאילה, נבדוק אם יש פריטים שצריך לבטל להם שריון (אלו ששואלים כרגע)
        if (data.action === 'שאילת ציוד' && data.itemsThatWereReserved) {
            // מאחדים ביטולים ידניים עם פריטים שהופכים משריון להשאלה
            const existingCancels = finalReserveCancel.split(',').filter(Boolean);
            const autoCancels = data.itemsThatWereReserved.split(',').filter(Boolean);
            const combined = [...new Set([...existingCancels, ...autoCancels])];
            finalReserveCancel = combined.length > 0 ? `,${combined.join(',')},` : '';
        }

        // שימוש בשמות עמודות במקום אינדקסים
        const rowData = {
            'חותמת זמן': formattedDate,
            'פעולה': data.action || '',
            'שם': data.userName || '',
            'טלפון': data.phone || '',
            'תאריך החזרה צפוי': data.returnDate || '',
            'מעילים שאולים': data.coats || '',
            'מכנסיים שאולים': data.pants || '',
            'פריטים נוספים שאולים': data.additional || '',
            'פריטים מוחזרים': data.returnItems || '',
            'פריטים משוריינים': data.reserveItems || '',
            'שריון מתאריך': data.reserveFrom || '',
            'שריון עד תאריך': data.reserveTo || '',
            'ביטול שריון': finalReserveCancel
        };

        await sheet.addRow(rowData);
        console.log(`✅ תגובה נרשמה (פעולה: ${data.action})`);
    } catch (err) {
        console.error('❌ שגיאה ברישום תגובה:', err);
    }
}

module.exports = {
    getAvailableItems,
    getBorrowedItemsByPhone,
	hasDateOverlap,
    parseDate,
	addResponse
};
