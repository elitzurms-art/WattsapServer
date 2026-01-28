process.env.SESSIONS_SHEET = 'Sessions_TEST';

const { saveSession, getSession, clearSession } = require('../sheets/sessions');
const { normalizePhone } = require('../sheets/helpers');

async function runTest(phone) {
    const p = normalizePhone(phone);

    await saveSession(p, 'IDLE');
    const s1 = await getSession(p);

    await saveSession(p, 'BORROW_SELECT', '305,306');
    const s2 = await getSession(p);

    await clearSession(p);
    const s3 = await getSession(p);

    return { phone: p, s1, s2, s3 };
}

async function main() {
    console.log('🧪 בדיקת סשנים – מצב TEST\n');

    const users = ['111111@lid', '222222@lid', '333333@lid'];
    const results = await Promise.all(users.map(runTest));

    results.forEach(r => {
        console.log('---');
        console.log('טלפון:', r.phone);
        console.log('אחרי יצירה:', r.s1);
        console.log('אחרי עדכון:', r.s2);
        console.log('אחרי מחיקה (צריך null):', r.s3);
    });

    console.log('\n✅ כל הבדיקות הסתיימו');
}

main().catch(console.error);
