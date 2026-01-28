jest.mock('../sheets/helpers', () => require('./__mocks__/helpers'));
jest.mock('../sheets/sessions', () => require('./__mocks__/sessions'));
jest.mock('../sheets/inventory', () => require('./__mocks__/inventory'));

const { handleMessage } = require('../handlers');
const inventory = require('../sheets/inventory');
const sessions = require('../sheets/sessions');
const { createMockClient } = require('./__mocks__/client.mock');
const { mockMsg } = require('./__mocks__/msg.mock');

test('🧪 תהליך החזרה מלא', async () => {
    const client = createMockClient();
    const phone = '222222@lid';

    inventory.getBorrowedItemsByPhone.mockResolvedValue({
        coats: [{ id: '401', name: 'מעיל כחול' }],
        pants: [],
        additional: []
    });

    await handleMessage(client, mockMsg({ from: phone, body: 'גמח סקי' }));
    await handleMessage(client, mockMsg({ from: phone, body: '2' }));
    await handleMessage(client, mockMsg({ from: phone, body: '401' }));
    await handleMessage(client, mockMsg({ from: phone, body: 'כן' }));

    expect(inventory.addResponse).toHaveBeenCalledWith(
        expect.objectContaining({
            action: 'החזרת ציוד',
            returnItems: ',401,'
        })
    );
});
