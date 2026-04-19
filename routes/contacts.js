const express = require('express');
const { toContactId, ok, bad, asyncHandler } = require('./utils');

function serializeContact(c) {
    return {
        id: c.id?._serialized,
        number: c.number,
        name: c.name,
        pushname: c.pushname,
        shortName: c.shortName,
        isBusiness: c.isBusiness,
        isEnterprise: c.isEnterprise,
        isMyContact: c.isMyContact,
        isWAContact: c.isWAContact,
        isBlocked: c.isBlocked,
        isGroup: c.isGroup,
    };
}

module.exports = function contactsRoutes(client) {
    const router = express.Router();

    router.get('/', asyncHandler(async (req, res) => {
        const contacts = await client.getContacts();
        return ok(res, { contacts: contacts.map(serializeContact) });
    }));

    router.get('/search', asyncHandler(async (req, res) => {
        const name = (req.query.name || '').toString().trim().toLowerCase();
        if (!name) return bad(res, 'Missing name');

        const contacts = await client.getContacts();
        const matches = contacts.filter(c => {
            const fields = [c.name, c.pushname, c.shortName, c.number].filter(Boolean);
            return fields.some(f => String(f).toLowerCase().includes(name));
        });
        return ok(res, { contacts: matches.map(serializeContact) });
    }));

    router.get('/:contactId', asyncHandler(async (req, res) => {
        const id = toContactId(req.params.contactId);
        if (!id) return bad(res, 'Invalid contactId');
        const contact = await client.getContactById(id);
        return ok(res, { contact: serializeContact(contact) });
    }));

    router.get('/:contactId/profilePicUrl', asyncHandler(async (req, res) => {
        const id = toContactId(req.params.contactId);
        if (!id) return bad(res, 'Invalid contactId');
        const url = await client.getProfilePicUrl(id);
        return ok(res, { url: url || null });
    }));

    router.get('/:contactId/about', asyncHandler(async (req, res) => {
        const id = toContactId(req.params.contactId);
        if (!id) return bad(res, 'Invalid contactId');
        const contact = await client.getContactById(id);
        const about = await contact.getAbout();
        return ok(res, { about: about || null });
    }));

    router.post('/:contactId/block', asyncHandler(async (req, res) => {
        const id = toContactId(req.params.contactId);
        if (!id) return bad(res, 'Invalid contactId');
        const contact = await client.getContactById(id);
        await contact.block();
        return ok(res, { blocked: true });
    }));

    router.delete('/:contactId/block', asyncHandler(async (req, res) => {
        const id = toContactId(req.params.contactId);
        if (!id) return bad(res, 'Invalid contactId');
        const contact = await client.getContactById(id);
        await contact.unblock();
        return ok(res, { blocked: false });
    }));

    return router;
};
