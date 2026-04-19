const express = require('express');
const bodyParser = require('body-parser');
const { normalizePhone } = require('./sheets/helpers');
const { sendToWhatsApp } = require('./chat-bridge');

const mediaRoutes = require('./routes/media');
const messagesRoutes = require('./routes/messages');
const chatsRoutes = require('./routes/chats');
const contactsRoutes = require('./routes/contacts');
const groupsRoutes = require('./routes/groups');
const presenceRoutes = require('./routes/presence');
const webhooksRoutes = require('./routes/webhooks');
const sessionRoutes = require('./routes/session');

const API_KEY = process.env.API_KEY || 'your-secret-key';
const PORT = process.env.API_PORT || 1000;

const rateLimits = new Map();
const MAX_MESSAGES_PER_MINUTE = 10;

function checkRateLimit(phone) {
    const now = Date.now();
    const key = normalizePhone(phone);

    if (!rateLimits.has(key)) rateLimits.set(key, []);

    const timestamps = rateLimits.get(key);
    const recent = timestamps.filter(t => now - t < 60000);

    if (recent.length >= MAX_MESSAGES_PER_MINUTE) return false;

    recent.push(now);
    rateLimits.set(key, recent);
    return true;
}

// ניקוי rate limits כל 5 דקות
setInterval(() => {
    const now = Date.now();
    for (const [phone, timestamps] of rateLimits.entries()) {
        const recent = timestamps.filter(t => now - t < 60000);
        if (recent.length === 0) rateLimits.delete(phone);
        else rateLimits.set(phone, recent);
    }
}, 5 * 60 * 1000);

function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        console.log('❌ Unauthorized API request');
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
    }
    next();
}

function createApiServer(whatsappClient) {
    const app = express();
    app.use(bodyParser.json({ limit: '25mb' }));

    // === Public ===
    app.get('/health', (req, res) => {
        res.json({ ok: true, status: 'running', timestamp: new Date().toISOString() });
    });

    // === Legacy /send — behavior preserved ===
    app.post('/send', authenticate, async (req, res) => {
        const { phone, message, source } = req.body;

        if (!phone || !message)
            return res.status(400).json({ ok: false, error: 'Missing phone or message' });

        let formattedPhone = normalizePhone(phone);

        if (!checkRateLimit(formattedPhone)) {
            console.log(`⚠️ Rate limit exceeded for ${formattedPhone}`);
            return res.status(429).json({ ok: false, error: 'Rate limit exceeded. Max 10 messages per minute.' });
        }

        try {
            if (source === 'AppsScript') {
                formattedPhone = `${formattedPhone}@c.us`;
                await whatsappClient.sendMessage(formattedPhone, message);
            } else {
                await sendToWhatsApp(whatsappClient, formattedPhone, message);
            }

            res.json({ ok: true, phone: formattedPhone, timestamp: new Date().toISOString() });
        } catch (err) {
            console.error(`❌ Failed to send to ${formattedPhone}:`, err);
            res.status(500).json({ ok: false, error: 'Failed to send message', details: err.toString() });
        }
    });

    // === Protected extended API ===
    app.use('/send', authenticate, mediaRoutes(whatsappClient));
    app.use('/messages', authenticate, messagesRoutes(whatsappClient));
    app.use('/chats', authenticate, chatsRoutes(whatsappClient));
    app.use('/contacts', authenticate, contactsRoutes(whatsappClient));
    app.use('/groups', authenticate, groupsRoutes(whatsappClient));
    app.use('/webhooks', authenticate, webhooksRoutes(whatsappClient));
    app.use('/session', authenticate, sessionRoutes(whatsappClient));
    app.use(authenticate, presenceRoutes(whatsappClient));

    app.use((err, req, res, next) => {
        console.error('💥 Unhandled API error:', err);
        res.status(500).json({ ok: false, error: 'Internal server error', details: err.message });
    });

    app.listen(PORT, () => {
        console.log(`🚀 WhatsApp API Server listening on port ${PORT}`);
        console.log(`📍 Health check: http://localhost:${PORT}/health`);
        console.log(`📤 Legacy send: POST http://localhost:${PORT}/send`);
        console.log(`🧩 Extended routes: /send/*, /messages, /chats, /contacts, /groups, /webhooks, /session, /me, /state`);
        console.log(`🔑 API Key required in header: x-api-key`);
    });

    return app;
}

module.exports = { createApiServer };
