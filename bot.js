// bot.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const { handleMessage } = require('./handlers');
const { getSession } = require('./sheets/sessions');


// =======================
// מניעת קריסת התהליך
// =======================
process.on('unhandledRejection', (reason) => {
    if (reason?.message?.includes('Execution context was destroyed')) {
        console.log('⚠️ דף וואטסאפ התרענן, ממתין לטעינה מחדש...');
        return;
    }
    if (reason?.message?.includes('markedUnread')) {
        console.log('⚠️ באג פנימי של WhatsApp Web – דולג');
        return;
    }
    console.error('💥 שגיאה:', reason);
});

// =======================
// יצירת לקוח WhatsApp
// =======================
const client = new Client({
    authStrategy: new LocalAuth(),
	
	autoMarkSeen: false,
	
    puppeteer: {
        executablePath: path.join(
            process.env.USERPROFILE,
            '.cache',
            'puppeteer',
            'chrome',
            'chrome.exe'
        ),
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--lang=en-US'
        ],
    },
});

// =======================
// QR
// =======================
client.on('qr', (qr) => {
    console.log('סרוק את קוד ה-QR הבא:');
    qrcode.generate(qr, { small: true });
});

// =======================
// Ready
// =======================
client.on('ready', () => {
    console.log('✅ הבוט מחובר ומוכן לעבודה! (2026)');
});

// =======================
// Disconnected
// =======================
client.on('disconnected', (reason) => {
    console.log('⚠️ הבוט נותק:', reason);
    setTimeout(() => client.initialize(), 240000);
});

// =======================
// הודעות נכנסות
// =======================
client.on('message', async (msg) => {
    // 1. חומת אש
    if (!msg || msg.fromMe || !msg.from || msg.from.endsWith('@g.us') || msg.from.endsWith('@broadcast') || (!msg.body && msg.type !== 'buttons_response')) {
		console.log('⛔ msg or body missing');
        return;
    }

    const text = msg.body?.trim().toLowerCase() || "";
    const phonePlus = msg.from;
	const phone = phonePlus.toString().replace(/\D/g, '');
	
    // 2. ניהול סשן
	console.log('📞 before getSession');
    const session = await getSession(phone);
	console.log('📞 after getSession', session?.state);

    // 3. בדיקת טריגר
    const triggerRegex = /^(גמ["״]?ח סקי|dn["״]?j xeh)$/i;
    const isTrigger = triggerRegex.test(text);

    // 4. סינון סופי - בדיקה בטוחה אם אין סשן או שאין לו מצב
    if (isTrigger === false && (!session || !session.state)) {
        return;
    }

    // 5. העברה לטיפול לוגי
    await handleMessage(client, msg, session);
});



// =======================
// Start
// =======================
client.initialize();
