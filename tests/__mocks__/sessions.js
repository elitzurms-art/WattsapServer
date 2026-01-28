// __mocks__/sessions.js
const db = {};

module.exports = {
  saveSession: jest.fn(async (phone, state, payload = '') => {
    const key = phone.replace(/@.*$/, '');
    db[key] = { state, payload };
    return db[key];
  }),
  getSession: jest.fn(async (phone) => {
    const key = phone.replace(/@.*$/, '');
    return db[key] || null;
  }),
  clearSession: jest.fn(async (phone) => {
    const key = phone.replace(/@.*$/, '');
    delete db[key];
  }),
  _db: db  // שימוש פנימי לבדיקה
};
