const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { ok, bad, asyncHandler } = require('./utils');

const SUPPORTED_EVENTS = new Set([
    'message',
    'message_revoke_everyone',
    'message_revoke_me',
    'message_reaction',
    'group_join',
    'group_leave',
    'call',
    'disconnected',
]);

const webhooks = new Map();
let seq = 1;

function serializeHook(h) {
    return { id: h.id, url: h.url, events: h.events, createdAt: h.createdAt };
}

function sign(body, secret) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function dispatch(event, payload) {
    const body = JSON.stringify({ event, payload, timestamp: Date.now() });
    for (const hook of webhooks.values()) {
        if (!hook.events.includes(event)) continue;
        const headers = { 'Content-Type': 'application/json' };
        if (hook.secret) headers['x-webhook-signature'] = sign(body, hook.secret);
        try {
            await axios.post(hook.url, body, { headers, timeout: 5000 });
        } catch (err) {
            console.error(`❌ Webhook ${hook.id} (${hook.url}) failed:`, err.message);
        }
    }
}

function attachClientListeners(client) {
    client.on('message', msg => {
        if (msg.fromMe) return;
        dispatch('message', {
            id: msg.id?._serialized,
            from: msg.from,
            to: msg.to,
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            isGroup: msg.from?.endsWith('@g.us'),
        });
    });

    client.on('message_revoke_everyone', (msg, revoked) => {
        dispatch('message_revoke_everyone', {
            id: msg?.id?._serialized,
            revokedId: revoked?.id?._serialized,
            from: revoked?.from || msg?.from,
        });
    });

    client.on('message_revoke_me', msg => {
        dispatch('message_revoke_me', { id: msg?.id?._serialized, from: msg?.from });
    });

    client.on('message_reaction', reaction => {
        dispatch('message_reaction', {
            id: reaction?.msgId?._serialized,
            reaction: reaction?.reaction,
            senderId: reaction?.senderId,
            timestamp: reaction?.timestamp,
        });
    });

    client.on('group_join', notification => {
        dispatch('group_join', {
            chatId: notification?.chatId,
            author: notification?.author,
            recipientIds: notification?.recipientIds,
            timestamp: notification?.timestamp,
        });
    });

    client.on('group_leave', notification => {
        dispatch('group_leave', {
            chatId: notification?.chatId,
            author: notification?.author,
            recipientIds: notification?.recipientIds,
            timestamp: notification?.timestamp,
        });
    });

    client.on('call', call => {
        dispatch('call', {
            id: call?.id,
            from: call?.from,
            isGroup: call?.isGroup,
            isVideo: call?.isVideo,
            timestamp: call?.timestamp,
        });
    });

    client.on('disconnected', reason => {
        dispatch('disconnected', { reason });
    });
}

module.exports = function webhooksRoutes(client) {
    const router = express.Router();
    attachClientListeners(client);

    router.get('/', asyncHandler(async (req, res) => {
        return ok(res, { webhooks: [...webhooks.values()].map(serializeHook) });
    }));

    router.post('/', asyncHandler(async (req, res) => {
        const { url, events, secret } = req.body;
        if (!url) return bad(res, 'Missing url');
        if (!Array.isArray(events) || !events.length) return bad(res, 'events must be a non-empty array');

        const invalid = events.filter(e => !SUPPORTED_EVENTS.has(e));
        if (invalid.length) return bad(res, `Unsupported events: ${invalid.join(', ')}`);

        const id = String(seq++);
        const hook = { id, url, events, secret: secret || null, createdAt: new Date().toISOString() };
        webhooks.set(id, hook);
        return ok(res, { webhook: serializeHook(hook) });
    }));

    router.delete('/:id', asyncHandler(async (req, res) => {
        const existed = webhooks.delete(req.params.id);
        if (!existed) return bad(res, 'Webhook not found', 404);
        return ok(res, { removed: true });
    }));

    return router;
};

module.exports.SUPPORTED_EVENTS = [...SUPPORTED_EVENTS];
