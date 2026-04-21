// ai/learning.js
// רישום כל התערבות AI לטאב "אי-הבנות" בגוגל שיטס.
// מטרה: לצבור דאטה-סט שממנו ניתן לשפר את הבוט (להוסיף וריאציות טקסט, לטפל בתבניות חוזרות וכו׳).

const { getDoc } = require('../sheets/helpers');

const SHEET_TITLE = 'אי-הבנות';
const HEADERS = [
    'חותמת זמן',
    'טלפון',
    'שם משתמש',
    'מצב',
    'טקסט גולמי',
    'מקור',           // text / voice
    'כלי AI',
    'קלט AI',
    'פעולה סופית',
    'הערות'
];

let sheetPromise = null;

async function ensureSheet() {
    if (sheetPromise) return sheetPromise;
    sheetPromise = (async () => {
        const doc = await getDoc();
        let sheet = doc.sheetsByTitle[SHEET_TITLE];
        if (!sheet) {
            sheet = await doc.addSheet({
                title: SHEET_TITLE,
                headerValues: HEADERS
            });
            console.log(`📝 נוצר טאב חדש: "${SHEET_TITLE}"`);
        } else {
            // וודא שיש כותרות
            try {
                await sheet.loadHeaderRow();
                if (!sheet.headerValues || sheet.headerValues.length === 0) {
                    await sheet.setHeaderRow(HEADERS);
                }
            } catch {
                await sheet.setHeaderRow(HEADERS);
            }
        }
        return sheet;
    })().catch(err => {
        console.error('❌ ensureSheet error:', err.message);
        sheetPromise = null; // אפשר ניסיון חוזר בפעם הבאה
        throw err;
    });
    return sheetPromise;
}

/**
 * רישום התערבות AI.
 * @param {Object} rec
 * @param {string} rec.phone
 * @param {string} [rec.userName]
 * @param {string} rec.state
 * @param {string} rec.rawText
 * @param {'text'|'voice'} [rec.source='text']
 * @param {string} rec.aiTool
 * @param {Object} [rec.aiInput]
 * @param {string} [rec.finalAction]
 * @param {string} [rec.notes]
 */
async function logAiInvocation(rec) {
    try {
        const sheet = await ensureSheet();
        await sheet.addRow({
            'חותמת זמן':     new Date().toISOString(),
            'טלפון':         rec.phone || '',
            'שם משתמש':      rec.userName || '',
            'מצב':           rec.state || '',
            'טקסט גולמי':    String(rec.rawText || '').slice(0, 500),
            'מקור':          rec.source || 'text',
            'כלי AI':        rec.aiTool || '',
            'קלט AI':        rec.aiInput ? JSON.stringify(rec.aiInput).slice(0, 500) : '',
            'פעולה סופית':   rec.finalAction || '',
            'הערות':         rec.notes || ''
        });
    } catch (err) {
        // לא לחסום את הבוט בגלל שגיאת לוג
        console.error('❌ logAiInvocation error:', err.message);
    }
}

module.exports = { logAiInvocation };
