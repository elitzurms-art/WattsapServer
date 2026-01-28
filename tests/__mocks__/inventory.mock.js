const inventory = require('../../sheets/inventory');

inventory.getAvailableItems = jest.fn();
inventory.getBorrowedItemsByPhone = jest.fn();
inventory.addResponse = jest.fn();

module.exports = inventory;
