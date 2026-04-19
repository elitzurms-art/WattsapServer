// bot.js
console.log('📦 טוען מודולים...');
require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const { handleMessage } = require('./handlers');
const { getSession } = require('./sheets/sessions');
const { handleReminderResponse } = require('./handlers/reminderResponse');
console.log('✅ כל המודולים נטענו');


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
    if (reason?.message?.includes('revoked') || reason?.message?.includes('deleted')) {
        console.log('⚠️ הודעה נמחקה באמצע הטיפול – דולג');
        return;
    }
    if (reason?.message?.includes('Message not found')) {
        console.log('⚠️ הודעה לא נמצאה – דולג');
        return;
    }
    console.error('💥 שגיאה לא מטופלת:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('💥 שגיאה קריטית:', error.message);
    console.error(error.stack);
});

// =======================
// יצירת לקוח WhatsApp
// =======================
console.log('🔧 יוצר Client...');
const client = new Client({
    authStrategy: new LocalAuth(),

	autoMarkSeen: false,


    puppeteer: {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
			'--disable-session-crashed-bubble', // מבטל את הודעת ה-"Restore" שראית
            '--disable-gpu',
			'--disable-infobars',               // מבטל סרגלי התראות
            '--noerrdialogs',                   // משתיק דיאלוגים של שגיאות
            '--no-first-run',
            '--no-zygote',
            '--lang=en-US'
        ],
    },
});
console.log('✅ Client נוצר בהצלחה');

// =======================
// QR
// =======================
client.on('qr', (qr) => {
    console.log('סרוק את קוד ה-QR הבא:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('🔐 Authenticated!');
});

client.on('auth_failure', (msg) => {
    console.log('❌ Auth failure:', msg);
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Loading ${percent}% - WhatsApp`);
});

client.on('change_state', (state) => {
    console.log('🔄 State changed to:', state);

    // אם נכנס למצב לא מחובר - אתחול מחדש
    if (state === 'CONFLICT' || state === 'UNLAUNCHED' || state === 'TIMEOUT') {
        console.log('⚠️ Bad state detected, restarting...');
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        process.exit(1);
    }
});


// =======================
// Ready + Health Check
// =======================
let lastMessageTime = Date.now();
let healthCheckInterval = null;
let servicesStarted = false;

client.on('ready', () => {
    console.log('✅ Bot is ready!');

    if (!servicesStarted) {
        servicesStarted = true;

        // הפעלת API Server (אופציונלי - רק אם API_KEY מוגדר)
        if (process.env.API_KEY) {
            const { createApiServer } = require('./api-server');
            createApiServer(client);
            console.log('🌐 API Server started for Apps Script integration');
        }

        // הפעלת Chat App Bridge (אם מוגדר)
        if (process.env.CHAT_APP_URL) {
            const { initBridge } = require('./chat-bridge');
            initBridge(client);
            console.log('🌉 Chat App Bridge initialized');
        }
    } else {
        console.log('⚠️ ready נורה שוב - דולג על הפעלת שירותים (כבר פעילים)');
    }

    // הפעלת health check כל 2 דקות
    if (healthCheckInterval) clearInterval(healthCheckInterval);

    healthCheckInterval = setInterval(async () => {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;

        // אם עברו 5 דקות בלי הודעות - בדיקת סטטוס
        if (timeSinceLastMessage > 5 * 60 * 1000) {
            try {
                const state = await client.getState();
                console.log(`💓 Health check - State: ${state}, Last message: ${Math.floor(timeSinceLastMessage / 1000)}s ago`);

                // אם הסטטוס לא CONNECTED - ניסיון reconnect
                if (state !== 'CONNECTED') {
                    console.log('⚠️ Not connected! Attempting to restart...');
                    clearInterval(healthCheckInterval);
                    process.exit(1); // יאתחל מחדש
                }
            } catch (err) {
                console.log('❌ Health check failed:', err.message);
                console.log('🔄 Restarting...');
                clearInterval(healthCheckInterval);
                process.exit(1);
            }
        } else {
            console.log(`💓 Health check OK - Last message: ${Math.floor(timeSinceLastMessage / 1000)}s ago`);
        }
    }, 2 * 60 * 1000); // כל 2 דקות
});


// =======================
// Disconnected
// =======================
client.on('disconnected', (reason) => {
    console.log('⚠️ נותק:', reason);
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    console.log('🔄 מאתחל מחדש...');
    process.exit(1); // תן ל-PM2 / nodemon להרים מחדש
});

// =======================
// הודעות שנמחקו
// =======================
client.on('message_revoke_everyone', async (msg, revoked_msg) => {
    console.log('🗑️ הודעה נמחקה על ידי השולח:', revoked_msg?.from || 'unknown');
});

client.on('message_revoke_me', async (msg) => {
    console.log('🗑️ הודעה נמחקה עבורי:', msg?.from || 'unknown');
});

// =======================
// הודעות נכנסות
// =======================

client.on('message', async (msg) => {
    // עדכון זמן הודעה אחרונה
    lastMessageTime = Date.now();

    // 1. חומת אש
    if (!msg || msg.fromMe || !msg.from || msg.from.endsWith('@g.us') || msg.from.endsWith('@broadcast') || (!msg.body && msg.type !== 'buttons_response')) {
		console.log('⛔ msg or body missing');
        return;
    }

    // התעלמות מהודעות שנמחקו
    if (msg.type === 'revoked' || msg.isRevoked) {
        console.log('🗑️ הודעה נמחקה - מתעלם');
        return;
    }

    const text = msg.body?.trim().toLowerCase() || "";
    const { normalizePhone } = require('./sheets/helpers');

    // קבלת מספר הטלפון הנכון מ-contact.number
    const contact = await msg.getContact();
    const phoneNumber = contact.number;
    const phone = normalizePhone(phoneNumber);

    // 2. קבלת סשן
    const session = await getSession(phone);

    // 3. בדיקת טריגר
    const triggerRegex = /^(גמ["״]?ח סקי|dn["״]?j xeh)$/i;
    const isTrigger = triggerRegex.test(text);

    // 4. ניתוב לפי מצב הסשן
    try {
        // א. אין סשן?
        if (!session) {
            if (isTrigger) {
                // יש "גמח סקי" - מתחיל סשן חדש
                await handleMessage(client, msg, session);
            } else {
                // אין סשן ואין טריגר - זורק
                return;
            }
        }
        // ב. סשן תזכורת?
        else if (session.state === 'REMINDER_PENDING') {
            await handleReminderResponse(client, msg, phone);
        }
        // ג. כל סשן אחר
        else {
            await handleMessage(client, msg, session);
        }
    } catch (err) {
        // טיפול בשגיאות שעלולות לקרות כאשר הודעה נמחקת באמצע הטיפול
        if (err.message?.includes('revoked') ||
            err.message?.includes('deleted') ||
            err.message?.includes('Message not found')) {
            console.log('⚠️ הודעה נמחקה באמצע הטיפול - מתעלם');
            return;
        }
        // שגיאות אחרות - להעלות הלאה
        console.error('❌ שגיאה בטיפול בהודעה:', err);
        throw err;
    }
});


// =======================
// Start
// =======================
console.log('🚀 מתחיל להפעיל את הבוט...');
client.initialize();
