// sessions.js
const {
    getDoc,
    normalizePhone,
	SESSIONS_SHEET_NAME
} = require('./helpers');

// ===============================
// שמירת סשן
// ===============================
async function saveSession(phone, state, payload = '', reserveFrom, reserveTo) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle[SESSIONS_SHEET_NAME];
        if (!sheet) return;
		
		// הגבלתי ל200 שורות, אם רוצים אפשר להגדיל
        const rows = await sheet.getRows({ limit: 200 });
        const userPhone = normalizePhone(phone);

        const existingRow = rows.find(r => {
            const rowPhone = normalizePhone(String(r.get('phone') || ''));
            return rowPhone === userPhone;
        });

        // 🔹 הכנה לעדכון
        const updateData = {
            phone: userPhone,
            state: state,
            payload: Array.isArray(payload) ? payload.join(';') : payload,
            updated: new Date().toLocaleString('he-IL'),
        };

        // 🔹 רק אם שולחים תאריכים - עדכן אותם
        if (reserveFrom !== undefined) updateData.reserveFrom = reserveFrom;
        if (reserveTo !== undefined)   updateData.reserveTo   = reserveTo;

        if (existingRow) {
            existingRow.assign(updateData);
            await existingRow.save();
            console.log(`[Sessions] סשן עודכן עבור: ${userPhone}`);
        } else {
            // אם לא קיימת שורה, חשוב לכלול תאריכים גם כאן
            if (reserveFrom !== undefined) updateData.reserveFrom = reserveFrom;
            if (reserveTo !== undefined)   updateData.reserveTo   = reserveTo;

            await sheet.addRow(updateData);
            console.log(`[Sessions] נוצר סשן חדש עבור: ${userPhone}`);
        }
    } catch (err) {
        console.error('❌ שגיאה בשמירת סשן:', err.message);
    }
}



// ===============================
// קבלת סשן
// ===============================
async function getSession(phone) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle[SESSIONS_SHEET_NAME];
        if (!sheet) {
            console.error('❌ גיליון Sessions לא נמצא');
            return null;
        }
        
		// הגבלתי ל200 שורות, אם רוצים אפשר להגדיל
        const rows = await sheet.getRows({ limit: 200 });
        const userPhone = normalizePhone(phone);

        // מחפשים את השורה האחרונה של המשתמש
        const lastRow = [...rows].reverse().find(r => {
            const rowPhone = normalizePhone(r.get('phone') || r['phone'] || '');
            return rowPhone === userPhone;
        });

        if (!lastRow) {
            console.log(`[Sessions] לא נמצא סשן עבור: ${userPhone}`);
            return null;
        }
		
        // שליפת הערכים בעזרת .get() - הדרך הנכונה
        const state = lastRow.get('state') || '';
        const payload = lastRow.get('payload') || '';
		const reserveFrom = lastRow.get('reserveFrom') || '';
		const reserveTo   = lastRow.get('reserveTo') || '';

        console.log(`[Sessions] נמצא סשן במצב: ${state}`);

		return { state, payload, reserveFrom, reserveTo }; 
		
    } catch (err) {
        console.error('❌ שגיאה בשליפת סשן:', err.message);
        return null;
    }
}


// ===============================
// מחיקת סשן
// ===============================
async function clearSession(phone) {
    try {
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle[SESSIONS_SHEET_NAME];
        if (!sheet) return;

		// הגבלתי ל200 שורות, אם רוצים אפשר להגדיל
        const rows = await sheet.getRows({ limit: 200 });
        const userPhone = normalizePhone(phone);

        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
			const rowPhone = normalizePhone(row.get('phone') || row['phone']);

            if (rowPhone === userPhone) {
                await row.delete();
                // console.log(`[Sessions] נמחקה שורה עבור: ${userPhone}`);
            }
        }
    } catch (err) {
        console.error('❌ שגיאה במחיקת סשן:', err.message);
    }
}


module.exports = { saveSession, getSession, clearSession };
