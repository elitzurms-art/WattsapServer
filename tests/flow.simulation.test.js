// tests/flow.interactive.test.js
const chalk = require('chalk');
const { handleMessage } = require('../handlers');
const { mockMsg } = require('./__mocks__/msg.mock'); // <-- כאן
const { createMockClient } = require('./__mocks__/client.mock');
const sessions = require('../sheets/sessions');
const inventory = require('../sheets/inventory');

// --- מוקים של sheets ---
jest.mock('../sheets/helpers', () => require('./__mocks__/helpers'));
jest.mock('../sheets/sessions', () => require('./__mocks__/sessions'));
jest.mock('../sheets/inventory', () => require('./__mocks__/inventory'));

// --- פונקציות עזר להדפסות ---
function printUser(phone, text) {
    console.log(chalk.cyan(`[USER ${phone}] ${text}`));
}

function printBot(phone, text) {
    console.log(chalk.green(`[BOT  ${phone}] ${text}`));
}

function printSession(phone, session) {
    console.log(chalk.magenta(`[SESSION ${phone}] State: ${session ? session.state : 'NULL'}`));
}

// --- פונקציה להרצת flow של משתמש ---
async function simulateFlow(phone, actions) {
    const client = createMockClient();

    for (const action of actions) {
        printUser(phone, action);

        await handleMessage(client, mockMsg({ from: phone, body: action }));

        // הדפס את כל ההודעות שהבוט שלח
        client.sentMessages
            .filter(m => m.to === phone + '@lid')
            .forEach(m => printBot(phone, m.body));

        // נקה את ההודעות אחרי ההדפסה
        client.sentMessages = [];
    }

    const session = await sessions.getSession(phone);
    printSession(phone, session);
}

// --- סימולציה של מספר משתמשים במקביל ---
describe('💡 סימולציית WhatsApp Flow אינטראקטיבית', () => {
    it('שאילה והחזרה', async () => {
        console.log(chalk.yellow('--- התחלת שאילה ---'));
        inventory.getAvailableItems.mockResolvedValue({
            coats: [{ id: '305', name: 'מעיל אדום' }],
            pants: [],
            additional: []
        });

        await simulateFlow('111111', ['גמח סקי', '1', '305', 'כן']);

        console.log(chalk.yellow('--- התחלת החזרה ---'));
        inventory.getBorrowedItemsByPhone.mockResolvedValue({
            coats: [{ id: '401', name: 'מעיל כחול' }],
            pants: [],
            additional: []
        });

        await simulateFlow('222222', ['גמח סקי', '2', '401', 'כן']);
    });
});
