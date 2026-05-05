const { MessageMedia } = require('whatsapp-web.js');
const { normalizePhone } = require('../sheets/helpers');

function toChatId(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    if (str.endsWith('@c.us') || str.endsWith('@g.us') || str.endsWith('@broadcast')) return str;
    const normalized = normalizePhone(str);
    if (!normalized) return null;
    return `${normalized}@c.us`;
}

function toGroupId(id) {
    if (!id) return null;
    const str = String(id).trim();
    if (str.endsWith('@g.us')) return str;
    const digits = str.replace(/\D/g, '');
    return digits ? `${digits}@g.us` : null;
}

function toContactId(id) {
    return toChatId(id);
}

function ok(res, payload = {}) {
    return res.json({ ok: true, ...payload, timestamp: new Date().toISOString() });
}

function bad(res, error, status = 400, details) {
    const body = { ok: false, error };
    if (details) body.details = details;
    return res.status(status).json(body);
}

function mapWwebError(err) {
    const raw = err?.message || String(err);
    if (/No LID for user|wid error: invalid wid|getNumberId/i.test(raw)) {
        return { error: 'Recipient not on WhatsApp', details: raw };
    }
    if (/Evaluation failed/i.test(raw)) {
        return { error: 'WhatsApp Web evaluation failed', details: raw };
    }
    if (/not found/i.test(raw)) {
        return { error: 'Resource not found', details: raw };
    }
    return { error: 'WhatsApp operation failed', details: raw };
}

// שגיאות שמעידות על דפדפן/דף שמת — אין דרך להתאושש בלי restart מלא של Chrome.
// ב-bot.js יש רשימה דומה ב-unhandledRejection, אבל שגיאות שנזרקות בתוך
// route handlers נתפסות ע"י asyncHandler ולא מגיעות לשם. בלי הזיהוי הזה
// /state ימשיך להחזיר 500 לנצח עד שה-health-check הפנימי (כל 2 דק', רק
// אחרי 5 דק' שקט) יחליט להרים מחדש.
const FATAL_BROWSER_PATTERNS = [
    'detached Frame',
    'Target closed',
    'Session closed',
    'Protocol error: Connection closed',
    'Most likely the page has been closed',
];

function isFatalBrowserError(err) {
    const msg = err?.message || String(err);
    return FATAL_BROWSER_PATTERNS.some(p => msg.includes(p));
}

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error(`❌ ${req.method} ${req.originalUrl}:`, err);
            const mapped = mapWwebError(err);
            const fatal = isFatalBrowserError(err);
            res.status(fatal ? 503 : 500).json({ ok: false, ...mapped });
            if (fatal) {
                console.error('💥 שגיאת דפדפן פטאלית בנתיב — יוצא לאתחול ע"י start.sh');
                // השהייה קטנה כדי שהתשובה תישלח ללקוח לפני שהתהליך נסגר
                setTimeout(() => process.exit(1), 100);
            }
        });
    };
}

async function buildMedia({ url, base64, mimetype, filename }) {
    if (url) {
        return await MessageMedia.fromUrl(url, { unsafeMime: true });
    }
    if (base64) {
        if (!mimetype) throw new Error('mimetype required when sending raw base64');
        return new MessageMedia(mimetype, base64, filename || null);
    }
    return null;
}

function extractMediaArgs(body, prefix) {
    return {
        url: body[`${prefix}Url`] || body.url,
        base64: body[`${prefix}Base64`] || body.base64,
        mimetype: body.mimetype,
        filename: body.filename,
    };
}

module.exports = {
    toChatId,
    toGroupId,
    toContactId,
    ok,
    bad,
    mapWwebError,
    asyncHandler,
    buildMedia,
    extractMediaArgs,
};
