const express = require('express');
const { toChatId, toGroupId, ok, bad, asyncHandler, buildMedia } = require('./utils');

async function loadGroup(client, rawId) {
    const id = toGroupId(rawId);
    if (!id) throw new Error('Invalid groupId');
    const chat = await client.getChatById(id);
    if (!chat.isGroup) throw new Error('Chat is not a group');
    return chat;
}

function serializeGroup(g) {
    return {
        id: g.id?._serialized,
        name: g.name,
        description: g.description,
        owner: g.owner?._serialized,
        createdAt: g.createdAt,
        participants: (g.participants || []).map(p => ({
            id: p.id?._serialized,
            isAdmin: p.isAdmin,
            isSuperAdmin: p.isSuperAdmin,
        })),
    };
}

module.exports = function groupsRoutes(client) {
    const router = express.Router();

    router.post('/', asyncHandler(async (req, res) => {
        const { name, participants } = req.body;
        if (!name) return bad(res, 'Missing name');
        if (!Array.isArray(participants) || !participants.length) {
            return bad(res, 'participants must be a non-empty array');
        }
        const ids = participants.map(toChatId).filter(Boolean);
        if (!ids.length) return bad(res, 'No valid participant phone numbers');

        const result = await client.createGroup(name, ids);
        return ok(res, { group: result });
    }));

    router.get('/:groupId', asyncHandler(async (req, res) => {
        const group = await loadGroup(client, req.params.groupId);
        return ok(res, { group: serializeGroup(group) });
    }));

    router.patch('/:groupId', asyncHandler(async (req, res) => {
        const { name, description, messagesAdminsOnly, editInfoAdminsOnly } = req.body;
        const group = await loadGroup(client, req.params.groupId);
        const changes = {};
        if (name !== undefined) {
            await group.setSubject(name);
            changes.name = name;
        }
        if (description !== undefined) {
            await group.setDescription(description);
            changes.description = description;
        }
        if (messagesAdminsOnly !== undefined) {
            await group.setMessagesAdminsOnly(!!messagesAdminsOnly);
            changes.messagesAdminsOnly = !!messagesAdminsOnly;
        }
        if (editInfoAdminsOnly !== undefined) {
            await group.setInfoAdminsOnly(!!editInfoAdminsOnly);
            changes.editInfoAdminsOnly = !!editInfoAdminsOnly;
        }
        return ok(res, { updated: changes });
    }));

    router.post('/:groupId/participants', asyncHandler(async (req, res) => {
        const { phones } = req.body;
        if (!Array.isArray(phones) || !phones.length) return bad(res, 'phones must be a non-empty array');
        const ids = phones.map(toChatId).filter(Boolean);
        const group = await loadGroup(client, req.params.groupId);
        const result = await group.addParticipants(ids);
        return ok(res, { result });
    }));

    router.delete('/:groupId/participants', asyncHandler(async (req, res) => {
        const { phones } = req.body;
        if (!Array.isArray(phones) || !phones.length) return bad(res, 'phones must be a non-empty array');
        const ids = phones.map(toChatId).filter(Boolean);
        const group = await loadGroup(client, req.params.groupId);
        const result = await group.removeParticipants(ids);
        return ok(res, { result });
    }));

    router.post('/:groupId/admins', asyncHandler(async (req, res) => {
        const { phones } = req.body;
        if (!Array.isArray(phones) || !phones.length) return bad(res, 'phones must be a non-empty array');
        const ids = phones.map(toChatId).filter(Boolean);
        const group = await loadGroup(client, req.params.groupId);
        const result = await group.promoteParticipants(ids);
        return ok(res, { result });
    }));

    router.delete('/:groupId/admins', asyncHandler(async (req, res) => {
        const { phones } = req.body;
        if (!Array.isArray(phones) || !phones.length) return bad(res, 'phones must be a non-empty array');
        const ids = phones.map(toChatId).filter(Boolean);
        const group = await loadGroup(client, req.params.groupId);
        const result = await group.demoteParticipants(ids);
        return ok(res, { result });
    }));

    router.post('/:groupId/picture', asyncHandler(async (req, res) => {
        const { imageUrl, imageBase64, mimetype } = req.body;
        if (!imageUrl && !imageBase64) return bad(res, 'Missing imageUrl or imageBase64');
        const media = await buildMedia({ url: imageUrl, base64: imageBase64, mimetype: mimetype || 'image/jpeg' });
        const group = await loadGroup(client, req.params.groupId);
        await group.setPicture(media);
        return ok(res, { pictureSet: true });
    }));

    router.get('/:groupId/inviteCode', asyncHandler(async (req, res) => {
        const group = await loadGroup(client, req.params.groupId);
        const code = await group.getInviteCode();
        return ok(res, { code, url: `https://chat.whatsapp.com/${code}` });
    }));

    router.post('/:groupId/inviteCode/revoke', asyncHandler(async (req, res) => {
        const group = await loadGroup(client, req.params.groupId);
        const code = await group.revokeInvite();
        return ok(res, { code, url: code ? `https://chat.whatsapp.com/${code}` : null });
    }));

    router.post('/:groupId/leave', asyncHandler(async (req, res) => {
        const group = await loadGroup(client, req.params.groupId);
        await group.leave();
        return ok(res, { left: true });
    }));

    return router;
};
