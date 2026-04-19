const express = require('express');
const { ok, bad, asyncHandler } = require('./utils');

let qrcodeLib = null;
try { qrcodeLib = require('qrcode'); } catch (_) { qrcodeLib = null; }

const state = {
    lastQr: null,
    lastQrAt: null,
    isReady: false,
};

function attachClientListeners(client) {
    client.on('qr', qr => {
        state.lastQr = qr;
        state.lastQrAt = new Date().toISOString();
        state.isReady = false;
    });
    client.on('ready', () => {
        state.isReady = true;
        state.lastQr = null;
    });
    client.on('authenticated', () => {
        state.lastQr = null;
    });
    client.on('disconnected', () => {
        state.isReady = false;
    });
}

module.exports = function sessionRoutes(client) {
    const router = express.Router();
    attachClientListeners(client);

    router.get('/qr', asyncHandler(async (req, res) => {
        if (state.isReady) return bad(res, 'Already authenticated', 409);
        if (!state.lastQr) return bad(res, 'No QR available yet', 404);

        const payload = { qr: state.lastQr, at: state.lastQrAt };
        if (qrcodeLib) {
            const dataUrl = await qrcodeLib.toDataURL(state.lastQr);
            payload.imageDataUrl = dataUrl;
            payload.imageBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        }
        return ok(res, payload);
    }));

    router.post('/logout', asyncHandler(async (req, res) => {
        await client.logout();
        state.isReady = false;
        return ok(res, { loggedOut: true });
    }));

    router.post('/restart', asyncHandler(async (req, res) => {
        res.json({ ok: true, restarting: true, timestamp: new Date().toISOString() });
        setTimeout(() => {
            console.log('🔄 /session/restart requested, exiting for supervisor restart');
            process.exit(0);
        }, 250);
    }));

    return router;
};
