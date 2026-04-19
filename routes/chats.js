const express = require('express');
const { ok, bad, asyncHandler } = require('./utils');

const MUTE_DURATIONS = {
    '8h': 8 * 60 * 60,
    '1w': 7 * 24 * 60 * 60,
    'year': 365 * 24 * 60 * 60,
};

module.exports = function chatsRoutes(client) {
    const router = express.Router();

    router.get('/', asyncHandler(async (req, res) => {
        const limit = Math.max(0, parseInt(req.query.limit, 10) || 50);
        const onlyWithUnread = String(req.query.onlyWithUnread || 'false').toLowerCase() === 'true';

        const chats = await client.getChats();
        let filtered = chats;
        if (onlyWithUnread) filtered = filtered.filter(c => c.unreadCount > 0);
        if (limit) filtered = filtered.slice(0, limit);

        const payload = filtered.map(c => ({
            id: c.id._serialized,
            name: c.name,
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
            timestamp: c.timestamp,
            archived: c.archived,
            pinned: c.pinned,
            isMuted: c.isMuted,
            lastMessage: c.lastMessage ? {
                id: c.lastMessage.id?._serialized,
                body: c.lastMessage.body,
                timestamp: c.lastMessage.timestamp,
                fromMe: c.lastMessage.fromMe,
            } : null,
        }));

        return ok(res, { chats: payload });
    }));

    router.get('/:chatId/messages', asyncHandler(async (req, res) => {
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
        const before = req.query.before ? parseInt(req.query.before, 10) : null;

        const chat = await client.getChatById(req.params.chatId);
        let messages = await chat.fetchMessages({ limit: before ? limit * 2 : limit });
        if (before) messages = messages.filter(m => m.timestamp < before).slice(-limit);

        const payload = messages.map(m => ({
            id: m.id._serialized,
            body: m.body,
            from: m.from,
            to: m.to,
            fromMe: m.fromMe,
            timestamp: m.timestamp,
            type: m.type,
            hasMedia: m.hasMedia,
            ack: m.ack,
        }));

        return ok(res, { messages: payload });
    }));

    router.post('/:chatId/markRead', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.sendSeen();
        return ok(res, { markedRead: true });
    }));

    router.post('/:chatId/markUnread', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.markUnread();
        return ok(res, { markedUnread: true });
    }));

    router.post('/:chatId/archive', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.archive();
        return ok(res, { archived: true });
    }));

    router.delete('/:chatId/archive', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.unarchive();
        return ok(res, { archived: false });
    }));

    router.post('/:chatId/pin', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.pin();
        return ok(res, { pinned: true });
    }));

    router.delete('/:chatId/pin', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.unpin();
        return ok(res, { pinned: false });
    }));

    router.post('/:chatId/mute', asyncHandler(async (req, res) => {
        const { duration } = req.body;
        const chat = await client.getChatById(req.params.chatId);

        if (duration === null || duration === undefined) {
            await chat.unmute();
            return ok(res, { muted: false });
        }

        const seconds = MUTE_DURATIONS[duration];
        if (!seconds) return bad(res, 'duration must be one of 8h, 1w, year, or null');

        const unmuteDate = new Date(Date.now() + seconds * 1000);
        await chat.mute(unmuteDate);
        return ok(res, { muted: true, until: unmuteDate.toISOString() });
    }));

    router.delete('/:chatId', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.delete();
        return ok(res, { deleted: true });
    }));

    router.post('/:chatId/clear', asyncHandler(async (req, res) => {
        const chat = await client.getChatById(req.params.chatId);
        await chat.clearMessages();
        return ok(res, { cleared: true });
    }));

    router.post('/:chatId/typing', asyncHandler(async (req, res) => {
        const duration = Math.min(30000, Math.max(100, parseInt(req.body.duration, 10) || 3000));
        const chat = await client.getChatById(req.params.chatId);
        await chat.sendStateTyping();
        setTimeout(() => chat.clearState().catch(() => {}), duration);
        return ok(res, { typing: true, duration });
    }));

    router.post('/:chatId/recording', asyncHandler(async (req, res) => {
        const duration = Math.min(30000, Math.max(100, parseInt(req.body.duration, 10) || 3000));
        const chat = await client.getChatById(req.params.chatId);
        await chat.sendStateRecording();
        setTimeout(() => chat.clearState().catch(() => {}), duration);
        return ok(res, { recording: true, duration });
    }));

    return router;
};
