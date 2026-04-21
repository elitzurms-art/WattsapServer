// ai/intent.js
// הוצאת כוונה (intent) מהודעת משתמש באמצעות Claude Opus 4.7 עם tool use.
// נקרא רק כשהמטפל הקשיח (rigid) לא מצליח לפרש את ההודעה.

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 512;
const TIMEOUT_MS = 12_000;

let client = null;
function getClient() {
    if (client) return client;
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set in .env');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

// ===============================
// הגדרות כלים
// ===============================
const TOOL_DEFS = {
    menu_choice: {
        name: 'menu_choice',
        description: 'המשתמש בחר אופציה בתפריט הראשי: שאילה, החזרה/ביטול שריון, שריון, או ביטול.',
        input_schema: {
            type: 'object',
            properties: {
                choice: {
                    type: 'string',
                    enum: ['borrow', 'return', 'reserve', 'cancel'],
                    description: 'borrow=שאילה, return=החזרה או ביטול שריון, reserve=שריון, cancel=ביטול התהליך'
                }
            },
            required: ['choice']
        }
    },
    select_items: {
        name: 'select_items',
        description: 'המשתמש בחר פריט/ים. אם המשתמש ציין תיאור במקום מספר (למשל "המעיל האדום בגודל L"), זהה את המזהה/ים המתאים/ים מרשימת הפריטים שסופקה לך. החזר רק מזהים בני 3 ספרות שקיימים ברשימה.',
        input_schema: {
            type: 'object',
            properties: {
                item_ids: {
                    type: 'array',
                    items: { type: 'string', pattern: '^[0-9]{3}$' },
                    description: 'רשימת מזהי פריטים (3 ספרות) שהמשתמש בחר'
                }
            },
            required: ['item_ids']
        }
    },
    select_all: {
        name: 'select_all',
        description: 'המשתמש רוצה להחזיר את כל הפריטים שלו. משתמשים בזה רק בהחזרה.',
        input_schema: { type: 'object', properties: {} }
    },
    set_dates: {
        name: 'set_dates',
        description: 'המשתמש ציין תאריכי שריון (התחלה וסיום) בצורה שאינה בפורמט תקני. החזר בפורמט DD/MM/YYYY.',
        input_schema: {
            type: 'object',
            properties: {
                from_date: { type: 'string', description: 'DD/MM/YYYY' },
                to_date: { type: 'string', description: 'DD/MM/YYYY' }
            },
            required: ['from_date', 'to_date']
        }
    },
    confirm: {
        name: 'confirm',
        description: 'המשתמש אישר את הפעולה (כן, אוקיי, אישור, בסדר, סבבה, בטח, מאשר, כן בבקשה וכו׳).',
        input_schema: { type: 'object', properties: {} }
    },
    cancel: {
        name: 'cancel',
        description: 'המשתמש מבטל את התהליך הנוכחי (לא, ביטול, עזוב, די, תשכח מזה וכו׳).',
        input_schema: { type: 'object', properties: {} }
    },
    clarify: {
        name: 'clarify',
        description: 'אין מספיק מידע או שהבקשה דו-משמעית. שאל שאלת הבהרה קצרה בעברית טבעית.',
        input_schema: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'שאלת הבהרה קצרה בעברית (משפט אחד)' }
            },
            required: ['question']
        }
    },
    none: {
        name: 'none',
        description: 'ההודעה לא קשורה לתהליך (סתם שיחה / ברכות / הודעה מוטעית שלא אמורה להשפיע). אל תעשה כלום.',
        input_schema: { type: 'object', properties: {} }
    }
};

const STATE_TOOLS = {
    BORROW_RETURN_SELECT:   ['menu_choice', 'cancel', 'clarify', 'none'],
    BORROW_SELECT:          ['select_items', 'cancel', 'clarify', 'none'],
    RETURN_SELECT:          ['select_items', 'select_all', 'cancel', 'clarify', 'none'],
    RESERVE_SELECT:         ['select_items', 'cancel', 'clarify', 'none'],
    RESERVE_DATE:           ['confirm', 'cancel', 'clarify', 'none'],
    RESERVE_DATES_CONFIRM:  ['set_dates', 'cancel', 'clarify', 'none'],
    BORROW_CONFIRM:         ['confirm', 'cancel', 'clarify', 'none'],
    RETURN_CONFIRM:         ['confirm', 'cancel', 'clarify', 'none'],
    RESERVE_CONFIRM:        ['confirm', 'cancel', 'clarify', 'none']
};

// ===============================
// בניית system prompt
// ===============================
function buildSystemPrompt() {
    return [
        'אתה עוזר הבנה (NLU) לבוט וואטסאפ של "גמ"ח סקי בגולן" — שירות השאלת ציוד סקי (מעילים, מכנסיים, גוגלס, כפפות, נעליים, חרמוניות, קסדות וכו׳).',
        'המשתמשים מתכתבים בעברית, לפעמים עם שגיאות כתיב / סלנג / הודעות חופשיות.',
        '',
        'תפקידך: להבין את כוונת המשתמש במצב הנוכחי של השיחה ולהחזיר קריאת כלי (tool call) מתאימה.',
        '',
        '## מצבי השיחה:',
        '- BORROW_RETURN_SELECT — המשתמש בתפריט הראשי ובוחר מה לעשות (שאילה / החזרה / שריון / ביטול).',
        '- BORROW_SELECT — המשתמש בוחר פריט/ים לשאול מרשימת הפריטים הזמינים.',
        '- RETURN_SELECT — המשתמש בוחר פריט/ים להחזיר מרשימת הפריטים שלו (יכול גם לבחור את כולם).',
        '- RESERVE_SELECT — המשתמש בוחר פריט/ים לשריין לעתיד.',
        '- RESERVE_DATE — המשתמש מתבקש לאשר התחלה של שלב בחירת תאריכי שריון.',
        '- RESERVE_DATES_CONFIRM — המשתמש נותן 2 תאריכים (התחלה וסיום) לשריון בפורמט DD/MM/YYYY.',
        '- BORROW_CONFIRM / RETURN_CONFIRM / RESERVE_CONFIRM — המשתמש מתבקש לאשר את הפעולה הסופית.',
        '',
        '## כללים:',
        '1. השתמש תמיד באחד הכלים שסופקו למצב הנוכחי. אסור לענות בטקסט חופשי בלי tool call.',
        '2. אם ההודעה ברורה — קרא לכלי המתאים.',
        '3. אם ההודעה דו-משמעית או חסרה — קרא ל-clarify עם שאלת הבהרה קצרה וטבעית בעברית.',
        '4. אם ההודעה אינה קשורה לתהליך (ברכה / ספאם / טעות) — קרא ל-none.',
        '5. עבור select_items: החזר רק מזהים שקיימים ברשימה שסופקה. אם המשתמש ציין תיאור ("המעיל האדום"), זהה את המזהה לפי הרשימה.',
        '6. עבור set_dates: פענח תאריכים בכל פורמט אפשרי (12.2, "לשבת", "בעוד שבועיים" וכו׳) והחזר DD/MM/YYYY. אם לא ברור — clarify.',
        '7. היה סלחני לשגיאות כתיב ולסלנג. עברית בלבד בתשובות של clarify.',
        '8. קצר ותכליתי. אל תוסיף הסברים.'
    ].join('\n');
}

function buildContextBlock({ state, inventorySnapshot, sessionPayload }) {
    const parts = [`## מצב נוכחי: ${state}`];

    if (sessionPayload) {
        parts.push('', '## פריטים שכבר נבחרו בסשן זה:');
        const [idsPart, namesPart] = String(sessionPayload).split('##');
        if (namesPart) {
            parts.push(namesPart.split(' | ').map(n => `- ${n}`).join('\n'));
        } else if (idsPart) {
            parts.push(idsPart);
        }
    }

    if (inventorySnapshot && inventorySnapshot.length) {
        parts.push('', '## רשימת פריטים רלוונטית:');
        inventorySnapshot.forEach(it => {
            parts.push(`- ${it.id}: ${it.name}${it.status && it.status !== 'במלאי' ? ` (${it.status})` : ''}`);
        });
    }

    return parts.join('\n');
}

// ===============================
// API call עם timeout
// ===============================
function withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`AI call timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

/**
 * מחלץ כוונה מהודעת משתמש.
 * @param {Object} ctx
 * @param {string} ctx.state - מצב נוכחי בסשן
 * @param {string} ctx.text  - טקסט ההודעה של המשתמש
 * @param {Array}  [ctx.inventorySnapshot] - רשימת פריטים רלוונטית למצב
 * @param {string} [ctx.sessionPayload]    - מחרוזת payload של הסשן ("ids##names")
 * @returns {Promise<{tool: string, input: object, reasoning?: string}|null>}
 */
async function extractIntent(ctx) {
    const { state, text } = ctx;
    const toolNames = STATE_TOOLS[state];
    if (!toolNames) return null;

    const tools = toolNames.map(n => TOOL_DEFS[n]);
    const systemText = buildSystemPrompt();
    const contextText = buildContextBlock(ctx);

    try {
        const api = getClient();
        const call = api.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: [
                { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }
            ],
            messages: [
                {
                    role: 'user',
                    content: `${contextText}\n\n## הודעת המשתמש:\n"${String(text || '').slice(0, 1000)}"`
                }
            ],
            tools,
            tool_choice: { type: 'any' }
        });

        const response = await withTimeout(call, TIMEOUT_MS);
        const toolUse = (response.content || []).find(c => c.type === 'tool_use');
        if (!toolUse) return null;

        const textBlock = (response.content || []).find(c => c.type === 'text');
        return {
            tool: toolUse.name,
            input: toolUse.input || {},
            reasoning: textBlock?.text || ''
        };
    } catch (err) {
        console.error('❌ extractIntent error:', err.message);
        return null;
    }
}

module.exports = { extractIntent, STATE_TOOLS };
