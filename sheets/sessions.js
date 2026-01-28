// sessions.js (In-Memory + TTL 30 דקות)
const { normalizePhone } = require('./helpers');

const SESSIONS_TTL_MS = 30 * 60 * 1000; // 30 דקות
const sessions = {};

// ===============================
// שמירת סשן
// ===============================
async function saveSession(phone, state, payload = '', reserveFrom, reserveTo) {
    try {
        const userPhone = normalizePhone(phone);

        if (!sessions[userPhone]) sessions[userPhone] = {};

        // שמירת פרטי הסשן
        sessions[userPhone] = {
            state,
            payload: Array.isArray(payload) ? payload.join(';') : payload,
            reserveFrom: reserveFrom ?? sessions[userPhone].reserveFrom ?? '',
            reserveTo:   reserveTo ?? sessions[userPhone].reserveTo ?? '',
            updated: new Date().toLocaleString('he-IL'),
        };

        // אם היה טיימאאוט קודם – נבטל אותו
        if (sessions[userPhone].timeout) clearTimeout(sessions[userPhone].timeout);

        // הגדרת טיימאאוט חדש למחיקה אוטומטית אחרי TTL
        sessions[userPhone].timeout = setTimeout(() => {
            delete sessions[userPhone];
            console.log(`[Sessions] הסשן נמחק אוטומטית אחרי 30 דקות עבור: ${userPhone}`);
        }, SESSIONS_TTL_MS);

        console.log(`[Sessions] סשן נשמר עבור: ${userPhone}`);
    } catch (err) {
        console.error('❌ שגיאה בשמירת סשן:', err.message);
    }
}

// ===============================
// קבלת סשן
// ===============================
async function getSession(phone) {
    try {
        const userPhone = normalizePhone(phone);
        const session = sessions[userPhone];

        if (!session) {
            console.log(`[Sessions] לא נמצא סשן עבור: ${userPhone}`);
            return null;
        }

        console.log(`[Sessions] נמצא סשן במצב: ${session.state}`);
        return { 
            state: session.state || '', 
            payload: session.payload || '', 
            reserveFrom: session.reserveFrom || '', 
            reserveTo: session.reserveTo || '' 
        };
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
        const userPhone = normalizePhone(phone);
        const session = sessions[userPhone];
        if (session) {
            if (session.timeout) clearTimeout(session.timeout);
            delete sessions[userPhone];
            console.log(`[Sessions] הסשן נמחק עבור: ${userPhone}`);
        }
    } catch (err) {
        console.error('❌ שגיאה במחיקת סשן:', err.message);
    }
}

module.exports = { saveSession, getSession, clearSession };
