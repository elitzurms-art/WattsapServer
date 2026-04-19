const express = require('express');
const { ok, asyncHandler } = require('./utils');

module.exports = function presenceRoutes(client) {
    const router = express.Router();

    router.get('/me', asyncHandler(async (req, res) => {
        const info = client.info || {};
        return ok(res, {
            me: {
                wid: info.wid?._serialized,
                pushname: info.pushname,
                platform: info.platform,
            },
        });
    }));

    router.get('/state', asyncHandler(async (req, res) => {
        const state = await client.getState();
        return ok(res, { state });
    }));

    return router;
};
