// chat-bridge.js - WhatsApp Bridge עם תמיכה בקבוצות ופרטיים
const axios = require('axios');
const { normalizePhone } = require('./sheets/helpers');

const CHAT_APP_URL = process.env.CHAT_APP_URL || 'http://127.0.0.1:5000/api/whatsapp/incoming';
const CHAT_APP_KEY = process.env.CHAT_APP_KEY || 'whatsapp-bridge-secret-key';
const SYNC_GROUPS = (process.env.SYNC_GROUPS || '').split(',').filter(Boolean);
const SYNC_CONTACTS = (process.env.SYNC_CONTACTS || '').split(',').filter(Boolean);

async function sendToChatApp(data) {
    try {
        const response = await axios.post(CHAT_APP_URL, data, {
            headers: {
                'Content-Type': 'application/json',
                'x-whatsapp-key': CHAT_APP_KEY,
            },
            timeout: 10000,
        });
        console.log('✅ Message forwarded to Chat App');
        return response.data;
    } catch (error) {
        console.error('❌ Failed to forward to Chat App:', error.message);
        throw error;
    }
}

function shouldSync(msg, chat) {
    if (chat.isGroup) {
        const groupName = chat.name || '';
        if (SYNC_GROUPS.length > 0) {
            return SYNC_GROUPS.some(g => groupName.includes(g));
        }
        return true;
    }

    if (!msg.from || msg.from === 'me' || msg.from.includes('broadcast')) return false;

    const fromNumber = msg.from.replace(/\D/g, '');

    if (SYNC_CONTACTS.length > 0) {
        return SYNC_CONTACTS.some(c => fromNumber === c);
    }

    return true;
}

async function handleWhatsAppMessage(msg, client) {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();

        if (!shouldSync(msg, chat)) return;

        const data = {
            phone: contact.number || contact.id.user,
            message: msg.body || '',
            from: contact.pushname || contact.name || contact.number,
            isGroup: chat.isGroup,
            groupName: chat.isGroup ? chat.name : null,
            chatId: chat.id._serialized,
            timestamp: msg.timestamp * 1000,
        };

        console.log('📤 Forwarding to Chat App:', {
            from: data.from,
            isGroup: data.isGroup,
            group: data.groupName,
            chatId: data.chatId
        });

        await sendToChatApp(data);
    } catch (error) {
        console.error('❌ Error handling WhatsApp message:', error);
    }
}

async function sendToWhatsApp(client, target, message, retry = 2) {
    if (!target) throw new Error('Missing target');

    const chatId = normalizePhone(target);

    console.log(`📤 Sending message to WhatsApp: ${chatId}`);

    try {
        const chat = await client.getChatById(chatId);
        await chat.sendMessage(message);
        console.log('✅ WhatsApp message sent successfully');
        return true;
    } catch (err) {
        console.error(`❌ WhatsApp Outgoing Error [${chatId}]:`, err.message);

        if (retry > 0) {
            console.log('🔄 Retrying in 2s...');
            await new Promise(r => setTimeout(r, 2000));
            return sendToWhatsApp(client, target, message, retry - 1);
        }

        throw err;
    }
}

function initBridge(client) {
    console.log('🌉 WhatsApp Bridge Initialized');
    client.on('message', async (msg) => {
        await handleWhatsAppMessage(msg, client);
    });
}

module.exports = {
    initBridge,
    sendToWhatsApp,
    handleWhatsAppMessage,
    normalizePhone
};
