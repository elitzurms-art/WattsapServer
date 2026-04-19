const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // זה יגרום לכרומיום לרדת לתוך תיקיית הפרויקט שלך
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
