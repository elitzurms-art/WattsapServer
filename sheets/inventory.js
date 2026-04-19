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
            const nameWattsap = row.get('שם השואל/ משריין') || "";
            const phoneWattsap = row.get('טלפון') || ""; 

            const reserveFrom = row.get('תאריך תחילת שיריון') || '';
            const reserveTo = row.get('תאריך סיום שיריון') || '';

            const item = {
                id: id,
                name: `${type} | מידה: ${row.get('מידה') || ''} | צבע: ${row.get('צבע') || ''}`.replace(/\s+/g, ' ').trim(),
                status: status,
                reserveFrom: reserveFrom,
                reserveTo: reserveTo,
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

            // מציאת האינדקס של המשתמש
            const userIndex = allPhones.findIndex(p => p === userPhone);

            const type = (row.get('סוג') || '').trim();
            const rawId = row.get('מס"ד');
            const id = (rawId !== undefined && rawId !== null && rawId !== '') ? String(rawId) : `item_${index}`;

            const nameWattsap = row.get('שם השואל/ משריין') || "";
            const reserveFrom = row.get('תאריך תחילת שיריון') || '';
            const reserveTo = row.get('תאריך סיום שיריון') || '';

            // חישוב תאריך החזרה לפי אינדקס המשתמש
            let reserveReturnBy = null;
            if ((status === 'משוריין' || status === 'מושאל+משוריין') && userIndex !== -1) {
                const fromArr = reserveFrom.split(',').map(d => d.trim());
                const userReserveDate = fromArr[userIndex] || '';

                if (userReserveDate && userReserveDate !== 'ללא') {
                    reserveReturnBy = getDayBefore(userReserveDate);
                }
            }

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


/**
 * מוצא את התאריך המוקדם ביותר מתוך רשימה מופרדת בפסיקים
 * @param {string} datesStr - מחרוזת תאריכים מופרדים בפסיק (לדוגמה: "15/02/26, 10/02/26, 20/02/26")
 * @returns {string|null} - התאריך המוקדם ביותר בפורמט DD/MM/YYYY או null
 */
function getEarliestDate(datesStr) {
    if (!datesStr) return null;

    // פיצול והסרת רווחים
    const datesList = datesStr.split(',')
        .map(d => d.trim())
        .filter(d => d && d !== 'ללא');

    if (datesList.length === 0) return null;

    // המרה לאובייקטי Date ומציאת המינימום
    let earliestDate = null;
    let earliestStr = null;

    datesList.forEach(dateStr => {
        const d = parseDate(dateStr);
        if (d) {
            if (!earliestDate || d < earliestDate) {
                earliestDate = d;
                earliestStr = dateStr;
            }
        }
    });

    return earliestStr;
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


// ===============================
// יומן פעולות - פונקציות חדשות
// ===============================

/**
 * כותב שורה חדשה ליומן פעולות
 */
async function addToLog(data) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['יומן פעולות'];

        if (!sheet) {
            console.error('❌ גיליון "יומן פעולות" לא נמצא');
            return;
        }

        await sheet.loadHeaderRow();
        const headers = sheet.headerValues;

        // מציאת מספר פעולה הבא
        const rows = await sheet.getRows();
        let nextActionNumber = 1;

        if (rows.length > 0) {
            const actionNumbers = rows
                .map(r => parseInt(r.get('מס\' פעולה') || '0'))
                .filter(n => !isNaN(n));

            if (actionNumbers.length > 0) {
                nextActionNumber = Math.max(...actionNumbers) + 1;
            }
        }

        // חותמת זמן
        const now = new Date();
        const timestamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)} ` +
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // שורה חדשה
        const targetRow = rows.length + 2; // +2 כי שורה 1 היא כותרות
        await sheet.loadCells(`A${targetRow}:F${targetRow}`);

        // מיפוי עמודות
        const col = {};
        headers.forEach((h, i) => col[h.trim()] = i);

        // כתיבה
        sheet.getCell(targetRow - 1, col['מס\' פעולה']).value = nextActionNumber;
        sheet.getCell(targetRow - 1, col['חותמת זמן']).value = timestamp;
        sheet.getCell(targetRow - 1, col['שם']).value = data.userName || '';
        sheet.getCell(targetRow - 1, col['טלפון']).value = data.phone || '';
        sheet.getCell(targetRow - 1, col['סוג הפעולה']).value = data.actionType || '';
        sheet.getCell(targetRow - 1, col['פריטים']).value = data.items || '';

        await sheet.saveUpdatedCells();

        console.log(`✅ נרשם ליומן (מס' ${nextActionNumber}): ${data.actionType} - ${data.userName} - ${data.items}`);
    } catch (err) {
        console.error('❌ שגיאה בכתיבה ליומן פעולות:', err.message);
    }
}

/**
 * מוצא או יוצר שורה עבור שאילות (בלי תאריכים) בגיליון "ניהול מלאי ממוחשב"
 * שורת שאילה = טלפון תואם + אין תאריכי שריון
 */
async function findOrCreateBorrowRow(phone, userName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle['ניהול מלאי ממוחשב'];

    console.log(`🔍 findOrCreateBorrowRow - מחפש שורת שאילה עבור ${phone}...`);

    if (!sheet) {
        console.error('❌ גיליון "ניהול מלאי ממוחשב" לא נמצא');
        return null;
    }

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const rows = await sheet.getRows();

    // חיפוש שורת שאילה קיימת (טלפון תואם + אין תאריכי שריון)
    for (let i = 0; i < rows.length; i++) {
        const rowPhone = rows[i].get('טלפון') || '';
        const reserveDatesFrom = (rows[i].get('שריון מתאריך') || '').toString().trim();
        const reserveDatesTo = (rows[i].get('שריון עד תאריך') || '').toString().trim();

        // שורת שאילה = טלפון תואם + אין תאריכים
        if (normalizePhone(rowPhone) === normalizePhone(phone) && !reserveDatesFrom && !reserveDatesTo) {
            console.log(`✅ נמצאה שורת שאילה קיימת בשורה ${i + 2}`);
            return { row: rows[i], rowNumber: i + 2, isNew: false };
        }
    }

    // יצירת שורת שאילה חדשה
    console.log(`🆕 יוצר שורת שאילה חדשה עבור ${phone} בשורה ${rows.length + 2}`);
    const newRowNumber = rows.length + 2;
    await sheet.loadCells(`A${newRowNumber}:F${newRowNumber}`);

    const col = {};
    headers.forEach((h, i) => col[h.trim()] = i);

    sheet.getCell(newRowNumber - 1, col['שם']).value = userName || '';
    sheet.getCell(newRowNumber - 1, col['טלפון']).value = phone || '';
    sheet.getCell(newRowNumber - 1, col['פריטים שאולים']).value = '';
    sheet.getCell(newRowNumber - 1, col['פריטים משוריינים']).value = '';
    sheet.getCell(newRowNumber - 1, col['שריון מתאריך']).value = '';
    sheet.getCell(newRowNumber - 1, col['שריון עד תאריך']).value = '';

    await sheet.saveUpdatedCells();

    const updatedRows = await sheet.getRows();
    console.log(`✅ שורת שאילה נוצרה בהצלחה!`);
    return { row: updatedRows[updatedRows.length - 1], rowNumber: newRowNumber, isNew: true };
}

/**
 * יוצר שורה חדשה עבור שריון בגיליון "ניהול מלאי ממוחשב"
 * כל פעולת שריון מקבלת שורה חדשה משלה
 */
async function createReservationRow(phone, userName, reservedItems, reserveDatesFrom, reserveDatesTo) {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle['ניהול מלאי ממוחשב'];

    console.log(`🔍 createReservationRow - יוצר שורת שריון חדשה עבור ${phone}...`);

    if (!sheet) {
        console.error('❌ גיליון "ניהול מלאי ממוחשב" לא נמצא');
        return null;
    }

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const rows = await sheet.getRows();

    const newRowNumber = rows.length + 2;
    await sheet.loadCells(`A${newRowNumber}:F${newRowNumber}`);

    const col = {};
    headers.forEach((h, i) => col[h.trim()] = i);

    sheet.getCell(newRowNumber - 1, col['שם']).value = userName || '';
    sheet.getCell(newRowNumber - 1, col['טלפון']).value = phone || '';
    sheet.getCell(newRowNumber - 1, col['פריטים שאולים']).value = '';
    sheet.getCell(newRowNumber - 1, col['פריטים משוריינים']).value = reservedItems || '';
    sheet.getCell(newRowNumber - 1, col['שריון מתאריך']).value = reserveDatesFrom || '';
    sheet.getCell(newRowNumber - 1, col['שריון עד תאריך']).value = reserveDatesTo || '';

    await sheet.saveUpdatedCells();

    const updatedRows = await sheet.getRows();
    console.log(`✅ שורת שריון נוצרה בהצלחה בשורה ${newRowNumber}!`);
    return { row: updatedRows[updatedRows.length - 1], rowNumber: newRowNumber, isNew: true };
}

/**
 * מוצא ומוחק פריטים משורות שריון
 * אם שורה נשארת ריקה - מוחק את כל השורה
 */
async function removeFromReservationRows(phone, itemsToRemove) {
    const doc = await getDoc();
    const sheet = doc.sheetsByTitle['ניהול מלאי ממוחשב'];

    console.log(`🔍 removeFromReservationRows - מחפש שורות שריון עבור ${phone}...`);

    if (!sheet) {
        console.error('❌ גיליון "ניהול מלאי ממוחשב" לא נמצא');
        return;
    }

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;
    const rows = await sheet.getRows();

    const col = {};
    headers.forEach((h, i) => col[h.trim()] = i);

    const itemsArray = itemsToRemove.split(',').filter(x => x.trim());

    // מעבר על כל השורות ומחיקת פריטים משורות שריון (מהסוף להתחלה כדי למנוע בעיות באינדקס)
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const rowPhone = row.get('טלפון') || '';
        const reserveDatesFrom = (row.get('שריון מתאריך') || '').toString().trim();
        const reserveDatesTo = (row.get('שריון עד תאריך') || '').toString().trim();
        const reservedItems = row.get('פריטים משוריינים') || '';

        // שורת שריון = טלפון תואם + יש תאריכים + יש פריטים משוריינים
        if (normalizePhone(rowPhone) === normalizePhone(phone) && reserveDatesFrom && reserveDatesTo && reservedItems) {
            const currentItems = reservedItems.split(',').filter(x => x.trim());
            const remainingItems = currentItems.filter(id => !itemsArray.includes(id.trim()));

            console.log(`🔍 שורה ${i + 2}: פריטים נוכחיים: ${currentItems.join(',')}, נשארו: ${remainingItems.join(',')}`);

            // אם לא נשארו פריטים - מחיקת השורה
            if (remainingItems.length === 0) {
                await row.delete();
                console.log(`🗑️ שורה ${i + 2} נמחקה (ריקה)`);
            } else {
                // עדכון השורה
                const rowNumber = i + 2;
                await sheet.loadCells(`A${rowNumber}:F${rowNumber}`);
                const newValue = ',' + remainingItems.join(',') + ',';
                sheet.getCell(rowNumber - 1, col['פריטים משוריינים']).value = newValue;
                await sheet.saveUpdatedCells();
                console.log(`✅ שורה ${rowNumber} עודכנה: ${newValue}`);
            }
        }
    }
}

/**
 * מוסיף פריטים לעמודה (עם פסיקים)
 */
function addItemsToColumn(currentValue, itemsToAdd) {
    const current = currentValue ? currentValue.toString().split(',').filter(x => x.trim()) : [];
    const toAdd = itemsToAdd ? itemsToAdd.toString().split(',').filter(x => x.trim()) : [];

    const combined = [...new Set([...current, ...toAdd])];
    return combined.length > 0 ? ',' + combined.join(',') + ',' : '';
}

/**
 * מסיר פריטים מעמודה
 */
function removeItemsFromColumn(currentValue, itemsToRemove) {
    const current = currentValue ? currentValue.toString().split(',').filter(x => x.trim()) : [];
    const toRemove = itemsToRemove ? itemsToRemove.toString().split(',').filter(x => x.trim()) : [];

    const remaining = current.filter(id => !toRemove.includes(id));
    return remaining.length > 0 ? ',' + remaining.join(',') + ',' : '';
}

/**
 * מסיר תאריכים שמתאימים לפריטים שנמחקו
 */
function removeDatesForItems(itemsColumn, datesColumn, itemsToRemove) {
    const items = itemsColumn ? itemsColumn.toString().split(',').filter(x => x.trim()) : [];
    const dates = datesColumn ? datesColumn.toString().split(',').map(x => x.trim()) : [];
    const toRemove = itemsToRemove ? itemsToRemove.toString().split(',').filter(x => x.trim()) : [];

    // מציאת אינדקסים למחיקה
    const indicesToRemove = [];
    items.forEach((item, idx) => {
        if (toRemove.includes(item)) {
            indicesToRemove.push(idx);
        }
    });

    // מחיקת פריטים ותאריכים
    const newItems = items.filter((_, idx) => !indicesToRemove.includes(idx));
    const newDates = dates.filter((_, idx) => !indicesToRemove.includes(idx));

    return {
        items: newItems.length > 0 ? ',' + newItems.join(',') + ',' : '',
        dates: newDates.length > 0 ? ',' + newDates.join(',') + ',' : ''
    };
}

/**
 * מעדכן גיליון "ניהול מלאי ממוחשב"
 * לוגיקה חדשה:
 * - שאילות: שורה אחת לכל אדם (בלי תאריכים)
 * - שריונים: שורה חדשה לכל פעולת שריון (עם תאריכים)
 * - החזרות: מחיקה מהשורה הקבועה
 * - ביטול שריון: מחיקה מהשורה עם התאריכים
 */
async function updateInventory(data) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle['ניהול מלאי ממוחשב'];

        if (!sheet) {
            console.error('❌ גיליון "ניהול מלאי ממוחשב" לא נמצא');
            return;
        }

        await sheet.loadHeaderRow();
        const headers = sheet.headerValues;
        const col = {};
        headers.forEach((h, i) => col[h.trim()] = i);

        console.log(`🔧 updateInventory - action: ${data.action}`);
        console.log(`📦 data:`, JSON.stringify(data, null, 2));

        if (data.action === 'add') {
            // הוספת פריטים שאולים - שורת שאילה קבועה
            if (data.borrowedItems) {
                console.log(`➕ מוסיף פריטים שאולים: ${data.borrowedItems}`);
                const borrowRow = await findOrCreateBorrowRow(data.phone, data.userName);
                if (!borrowRow) return;

                const { row, rowNumber } = borrowRow;
                await sheet.loadCells(`A${rowNumber}:F${rowNumber}`);

                let borrowedItems = sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value || '';
                borrowedItems = addItemsToColumn(borrowedItems, data.borrowedItems);
                sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value = borrowedItems;

                await sheet.saveUpdatedCells();
                console.log(`✅ פריטים שאולים נוספו: ${borrowedItems}`);
            }

            // הוספת פריטים משוריינים - שורה חדשה לכל פעולת שריון
            if (data.reservedItems) {
                console.log(`➕ יוצר שורת שריון חדשה: ${data.reservedItems}`);
                await createReservationRow(
                    data.phone,
                    data.userName,
                    data.reservedItems,
                    data.reserveDatesFrom,
                    data.reserveDatesTo
                );
            }
        } else if (data.action === 'remove') {
            // הסרת פריטים שאולים - מהשורה הקבועה
            if (data.borrowedItems) {
                console.log(`➖ מוחק פריטים שאולים: ${data.borrowedItems}`);
                const borrowRow = await findOrCreateBorrowRow(data.phone, data.userName);
                if (!borrowRow) return;

                const { row, rowNumber } = borrowRow;
                await sheet.loadCells(`A${rowNumber}:F${rowNumber}`);

                let borrowedItems = sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value || '';
                borrowedItems = removeItemsFromColumn(borrowedItems, data.borrowedItems);
                sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value = borrowedItems;

                await sheet.saveUpdatedCells();
                console.log(`✅ פריטים שאולים הוסרו: ${data.borrowedItems}`);

                // אם השורה ריקה - מחיקה
                if (!borrowedItems || borrowedItems === ',,') {
                    await row.delete();
                    console.log(`🗑️ שורת שאילה נמחקה (ריקה)`);
                }
            }

            // הסרת פריטים משוריינים - מהשורות המתאימות
            if (data.reservedItems) {
                console.log(`➖ מוחק פריטים משוריינים: ${data.reservedItems}`);
                await removeFromReservationRows(data.phone, data.reservedItems);
            }
        } else if (data.action === 'move') {
            // העברה ממשוריינים לשאולים
            if (data.items) {
                console.log(`🔄 מעביר פריטים ממשוריינים לשאולים: ${data.items}`);

                // הסרה מהשורות המשוריינות
                await removeFromReservationRows(data.phone, data.items);

                // הוספה לשורת השאילה
                const borrowRow = await findOrCreateBorrowRow(data.phone, data.userName);
                if (!borrowRow) return;

                const { row, rowNumber } = borrowRow;
                await sheet.loadCells(`A${rowNumber}:F${rowNumber}`);

                let borrowedItems = sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value || '';
                borrowedItems = addItemsToColumn(borrowedItems, data.items);
                sheet.getCell(rowNumber - 1, col['פריטים שאולים']).value = borrowedItems;

                await sheet.saveUpdatedCells();
                console.log(`🔄 פריטים הועברו לשורת השאילה: ${borrowedItems}`);
            }
        }

        console.log(`✅ מלאי עודכן בהצלחה`);
    } catch (err) {
        console.error('❌ שגיאה בעדכון מלאי:', err.message);
    }
}

module.exports = {
    getAvailableItems,
    getBorrowedItemsByPhone,
	hasDateOverlap,
    parseDate,
    addToLog,
    updateInventory,
    getDayBefore,
    getEarliestDate
};
