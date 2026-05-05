// apps-script-example.js
// מערכת תזכורות אוטומטית לגמ"ח סקי בגולן

/**
 * ===========================================
 * הגדרות
 * ===========================================
 */

const BOT_API_URL = 'https://bot.elitzurgames.com/send';
const API_KEY = 'a17d2A17d2';
const MANAGEMENT_SHEET_NAME = 'ניהול';

/**
 * ===========================================
 * פונקציה ראשית: שליחת הודעת WhatsApp
 * ===========================================
 */
function sendWhatsAppMessage(phone, message) {
  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': API_KEY
      },
      payload: JSON.stringify({
        phone: phone,
        message: message
      }),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(BOT_API_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      Logger.log(`✅ הודעה נשלחה בהצלחה ל-${phone}`);
      return true;
    } else {
      Logger.log(`❌ שגיאה בשליחת הודעה ל-${phone}: [${statusCode}] ${responseText}`);
      return false;
    }
  } 
  catch (err) {
    console.error('FULL ERROR OBJECT:', err);
    console.error('ERROR MESSAGE:', err.message);
    console.error('STACK:', err.stack);
    throw err;
  }
}

/**
 * ===========================================
 * עדכון סטטוס תזכורת בסשן (חדש!)
 * ===========================================
 */
function setReminderStatus(phone, itemId, status) {
  try {
    const baseUrl = BOT_API_URL.replace('/send', '');
    const url = baseUrl + '/set-reminder-status';

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': API_KEY
      },
      payload: JSON.stringify({
        phone: phone,
        itemId: itemId || null,
        status: status // 'pending' או 'clear'
      }),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      Logger.log(`✅ סטטוס תזכורת עודכן ל-${status} עבור ${phone}`);
      return true;
    } else {
      Logger.log(`⚠️ שגיאה בעדכון סטטוס תזכורת: [${statusCode}] ${responseText}`);
      return false;
    }
  } catch (error) {
    Logger.log(`❌ חריגה בעדכון סטטוס תזכורת: ${error.message}`);
    return false;
  }
}

/**
 * ===========================================
 * פונקציות עזר
 * ===========================================
 */

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function isSameDay(date1, date2) {
  return date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear();
}

/**
 * ===========================================
 * תזכורות החזרה - מושאל+משוריין
 * ===========================================
 * שולח תזכורת יום לפני שהשריון מתחיל
 * רק לשואל (האחרון ברשימה)
 */
function sendReturnReminder() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANAGEMENT_SHEET_NAME);
  if (!sheet) {
    Logger.log('❌ לא נמצא גיליון: ' + MANAGEMENT_SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // מיפוי עמודות דינמי
  const col = {};
  headers.forEach((h, i) => col[h.trim()] = i);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  Logger.log(`🔍 מחפש תזכורות החזרה לתאריך: ${formatDate(tomorrow)}`);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const status = row[col['סטטוס']];
    const itemId = row[col['מס"ד']];
    const phones = row[col['טלפון']] || '';
    const names = row[col['שם השואל/ משריין']] || row[col['שם השואל/משריין']] || '';
    const datesStart = row[col['תאריך תחילת שיריון']] || row[col['תאריך תחילת שריון']] || '';
    const datesEnd = row[col['תאריך סיום שיריון']] || row[col['תאריך סיום שריון']] || '';
    const reminderSent = row[col['נשלחה תזכורת החזרה']];

    // רק מושאל+משוריין
    if (status !== 'מושאל+משוריין') continue;

    // אם כבר נשלחה תזכורת
    if (reminderSent) continue;

    // פיצול לפי פסיקים
    const phoneArr = phones.toString().split(', ').map(p => p.trim());
    const nameArr = names.toString().split(', ').map(n => n.trim());
    const startArr = datesStart.toString().split(', ').map(d => d.trim());
    const endArr = datesEnd.toString().split(', ').map(d => d.trim());

    // חיפוש השואל (מי שיש לו "ללא" או ערך ריק)
    let borrowerIndex = -1;
    for (let j = 0; j < phoneArr.length; j++) {
      const dateValue = startArr[j] || '';
      if (dateValue === 'ללא' || dateValue.trim() === '') {
        borrowerIndex = j;
        break;
      }
    }

    // אם לא נמצא שואל - דלג
    if (borrowerIndex === -1) {
      Logger.log(`⚠️ לא נמצא שואל בפריט ${itemId}`);
      continue;
    }

    const borrowerPhone = phoneArr[borrowerIndex];
    const borrowerName = nameArr[borrowerIndex] || 'לקוח יקר';

    // חיפוש המשריין הראשון (שיש לו תאריך מחר)
    let reserverFound = false;
    for (let j = 0; j < phoneArr.length; j++) {
      // דילוג על השואל
      if (j === borrowerIndex) continue;

      const dateValue = startArr[j] || '';
      if (dateValue === 'ללא' || dateValue.trim() === '') continue;

      try {
        const startDate = new Date(startArr[j].split('/').reverse().join('-'));
        startDate.setHours(0, 0, 0, 0);

        if (isSameDay(startDate, tomorrow)) {
          reserverFound = true;

          // יצירת תיאור פריט
          const itemDesc = `${row[col['סוג']]} ${row[col['חברה']]} ${row[col['מידה']]} ` +
            `(${row[col['צבע']]}) – מס"ד ${itemId}`;

          // הודעה לשואל
          const message = `
⏰ תזכורת החזרה

שלום ${borrowerName}! 👋

הפריט ששאלת משוריין החל ממחר (${formatDate(tomorrow)}).

🎿 הפריט:
${itemDesc}

נא להחזיר את הפריט עוד היום כדי שהמשריין יוכל לקבל אותו מחר.

תודה רבה! ⛷️
          `.trim();

          Logger.log(`📤 שולח תזכורת החזרה ל-${borrowerName} (${borrowerPhone})`);
          sendWhatsAppMessage(borrowerPhone, message);

          // סימון שנשלחה תזכורת
          sheet.getRange(i + 1, col['נשלחה תזכורת החזרה'] + 1).setValue(true);

          break;
        }
      } catch (e) {
        Logger.log(`⚠️ שגיאה בפענוח תאריך: ${startArr[j]}`);
      }
    }

    if (reserverFound) {
      Utilities.sleep(1000); // המתנה בין הודעות
    }
  }
}

/**
 * ===========================================
 * אישור שריון - משוריין וגם מושאל+משוריין
 * ===========================================
 * שולח אישור יומיים לפני תחילת השריון
 * רק למשריינים (שיש להם תאריכים)
 */
function sendReservationConfirm() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANAGEMENT_SHEET_NAME);
  if (!sheet) {
    Logger.log('❌ לא נמצא גיליון: ' + MANAGEMENT_SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = {};
  headers.forEach((h, i) => col[h.trim()] = i);

  const today = new Date();
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);
  dayAfterTomorrow.setHours(0, 0, 0, 0);

  Logger.log(`🔍 מחפש אישורי שריון לתאריך: ${formatDate(dayAfterTomorrow)}`);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const status = row[col['סטטוס']];
    const itemId = row[col['מס"ד']];
    const phones = row[col['טלפון']] || '';
    const names = row[col['שם השואל/ משריין']] || row[col['שם השואל/משריין']] || '';
    const datesStart = row[col['תאריך תחילת שיריון']] || row[col['תאריך תחילת שריון']] || '';
    const datesEnd = row[col['תאריך סיום שיריון']] || row[col['תאריך סיום שריון']] || '';
    const confirmSent = row[col['נשלח אישור שריון']];

    // רק משוריין או מושאל+משוריין
    if (status !== 'משוריין' && status !== 'מושאל+משוריין') continue;

    // אם כבר נשלח אישור
    if (confirmSent) continue;

    // פיצול
    const phoneArr = phones.toString().split(', ').map(p => p.trim());
    const nameArr = names.toString().split(', ').map(n => n.trim());
    const startArr = datesStart.toString().split(', ').map(d => d.trim());
    const endArr = datesEnd.toString().split(', ').map(d => d.trim());

    // יצירת תיאור פריט
    const itemDesc = `${row[col['סוג']]} ${row[col['חברה']]} ${row[col['מידה']]} ` +
      `(${row[col['צבע']]}) – מס"ד ${itemId}`;

    let confirmSentToAny = false;

    // מעבר על כל המשריינים
    for (let j = 0; j < phoneArr.length; j++) {
      // דילוג על שואלים (שיש להם "ללא")
      if (startArr[j] === 'ללא') continue;

      try {
        const startDate = new Date(startArr[j].split('/').reverse().join('-'));
        startDate.setHours(0, 0, 0, 0);

        if (isSameDay(startDate, dayAfterTomorrow)) {
          const reserverPhone = phoneArr[j];
          const reserverName = nameArr[j] || 'לקוח יקר';
          const endDate = endArr[j];

          // הודעת אישור
          const message = `
📦 אישור שריון

שלום ${reserverName}! 👋

השריון שלך מתחיל בעוד יומיים (${formatDate(dayAfterTomorrow)}) 📅

🎿 הפריט השמור עבורך:
${itemDesc}

📅 תאריכי השריון:
מ-${startArr[j]} עד ${endDate}

האם אתה מעוניין לשמור על השריון?

השב:
1️⃣ כן – לשמור על השריון
2️⃣ ביטול – לבטל את השריון

אם לא תענה, נשלח תזכורת נוספת.

תודה! ⛷️
          `.trim();

          Logger.log(`📤 שולח אישור שריון ל-${reserverName} (${reserverPhone})`);
          sendWhatsAppMessage(reserverPhone, message);

          // עדכון סטטוס תזכורת בסשן (חדש!)
          setReminderStatus(reserverPhone, itemId, 'pending');

          // שמירת זמן שליחה בעמודה O
          const currentTimes = row[col['זמן שליחת תזכורת']] || '';
          const newTime = new Date();
          const timeStr = formatDate(newTime) + ' ' +
            String(newTime.getHours()).padStart(2, '0') + ':' +
            String(newTime.getMinutes()).padStart(2, '0');

          // בניית מערך זמנים
          const timesArr = currentTimes ? currentTimes.toString().split(', ') : [];
          while (timesArr.length < j) timesArr.push('');
          timesArr[j] = timeStr;

          sheet.getRange(i + 1, col['זמן שליחת תזכורת'] + 1)
            .setValue(timesArr.join(', '));

          confirmSentToAny = true;
          Utilities.sleep(1000);
        }
      } catch (e) {
        Logger.log(`⚠️ שגיאה בפענוח תאריך: ${startArr[j]}`);
      }
    }

    // סימון שנשלח אישור (גם אם רק לחלק)
    if (confirmSentToAny) {
      sheet.getRange(i + 1, col['נשלח אישור שריון'] + 1).setValue(true);
    }
  }
}

/**
 * ===========================================
 * בדיקת תשובות - 10:00, 14:00, 18:00
 * ===========================================
 * בודק מי לא ענה ושולח שוב
 * אחרי 48 שעות (יומיים) - מבטל אוטומטית
 */
function checkPendingResponses() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MANAGEMENT_SHEET_NAME);
  if (!sheet) {
    Logger.log('❌ לא נמצא גיליון: ' + MANAGEMENT_SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = {};
  headers.forEach((h, i) => col[h.trim()] = i);

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 שעות
  const currentHour = now.getHours();

  // רק בשעות 10, 14, 18 ביום
  const validHours = [10, 14, 18];
  if (!validHours.includes(currentHour)) {
    Logger.log(`⏸️ לא בשעת תזכורת (${currentHour}:00) - דולג`);
    return;
  }

  Logger.log(`🔍 בודק תשובות ממתינות בשעה ${currentHour}:00...`);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const confirmSent = row[col['נשלח אישור שריון']];
    const sendTimes = row[col['זמן שליחת תזכורת']] || '';
    const responses = row[col['תשובת משתמש']] || '';

    // אם לא נשלח אישור - דלג
    if (!confirmSent || !sendTimes) continue;

    const phones = row[col['טלפון']] || '';
    const phoneArr = phones.toString().split(', ').map(p => p.trim());
    const timeArr = sendTimes.toString().split(', ');
    const responseArr = responses ? responses.toString().split(', ') : [];

    // מעבר על כל משתמש
    for (let j = 0; j < phoneArr.length; j++) {
      if (!timeArr[j] || timeArr[j] === '') continue;

      const response = responseArr[j] || '';

      // אם כבר ענה - דלג
      if (response && response !== '') continue;

      // פענוח זמן השליחה
      try {
        const timeParts = timeArr[j].split(' ');
        const dateParts = timeParts[0].split('/');
        const clockParts = timeParts[1].split(':');

        const sentTime = new Date(
          parseInt('20' + dateParts[2]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[0]),
          parseInt(clockParts[0]),
          parseInt(clockParts[1])
        );

        // בדיקה אם עברו 48 שעות - ביטול אוטומטי
        if (sentTime < twoDaysAgo && currentHour === 18) {
          Logger.log(`🗑️ 48 שעות עברו ל-${phoneArr[j]} - מבטל אוטומטית`);

          // קבלת פרטי הפריט
          const itemId = row[col['מס"ד']];
          const itemType = row[col['סוג']];
          const itemSize = row[col['מידה']];
          const itemCompany = row[col['חברה']];
          const itemColor = row[col['צבע']];
          const names = row[col['שם השואל/ משריין']] || row[col['שם השואל/משריין']] || '';
          const nameArr = names.toString().split(', ').map(n => n.trim());
          const userName = nameArr[j] || 'לא ידוע';

          const itemDesc = `${itemType} ${itemCompany} ${itemSize} (${itemColor}) – מס"ד ${itemId}`;

          // הודעה למשתמש על ביטול אוטומטי
          const cancelMessage = `
❌ ביטול שריון אוטומטי

שלום ${userName},

מכיוון שלא קיבלנו תשובה ממך תוך 48 שעות, השריון בוטל אוטומטית.

🎿 הפריט:
${itemDesc}

הפריט כעת זמין לאחרים.

אם אתה עדיין מעוניין, אפשר לשריין מחדש דרך הבוט.

תודה!
          `.trim();

          Logger.log(`📤 שולח הודעת ביטול אוטומטי ל-${userName} (${phoneArr[j]})`);
          sendWhatsAppMessage(phoneArr[j], cancelMessage);

          // סימון תשובה כ"ביטול אוטומטי"
          responseArr[j] = 'ביטול אוטומטי';
          sheet.getRange(i + 1, col['תשובת משתמש'] + 1)
            .setValue(responseArr.join(', '));

          // עדכון זמן תשובה
          const responseTimeArr = (row[col['זמן תשובה']] || '').toString().split(', ');
          while (responseTimeArr.length < j) responseTimeArr.push('');
          const timeStr = formatDate(now) + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
          responseTimeArr[j] = timeStr;
          sheet.getRange(i + 1, col['זמן תשובה'] + 1)
            .setValue(responseTimeArr.join(', '));

          // הסרת המשתמש מהשורה (כמו בביטול ידני)
          phoneArr.splice(j, 1);
          nameArr.splice(j, 1);
          const datesStart = row[col['תאריך תחילת שיריון']] || row[col['תאריך תחילת שריון']] || '';
          const datesEnd = row[col['תאריך סיום שיריון']] || row[col['תאריך סיום שריון']] || '';
          const startArr = datesStart.toString().split(', ');
          const endArr = datesEnd.toString().split(', ');
          startArr.splice(j, 1);
          endArr.splice(j, 1);
          responseArr.splice(j, 1);
          responseTimeArr.splice(j, 1);
          timeArr.splice(j, 1);

          // עדכון כל העמודות
          // sheet.getRange(i + 1, col['טלפון'] + 1).setValue(phoneArr.join(', '));
          // sheet.getRange(i + 1, col['שם'] + 1).setValue(nameArr.join(', '));
          // sheet.getRange(i + 1, col['תאריך תחילת שיריון'] + 1).setValue(startArr.join(', '));
          // sheet.getRange(i + 1, col['תאריך סיום שיריון'] + 1).setValue(endArr.join(', '));
          // sheet.getRange(i + 1, col['תשובת משתמש'] + 1).setValue(responseArr.join(', '));
          // sheet.getRange(i + 1, col['זמן תשובה'] + 1).setValue(responseTimeArr.join(', '));
          // sheet.getRange(i + 1, col['זמן שליחת תזכורת'] + 1).setValue(timeArr.join(', '));

          // Logger.log(`✅ הוסר ${phoneArr[j]} מהשורה בניהול`);

          Utilities.sleep(1000);
          continue; // עבור למשתמש הבא
        }

        // אם לא עברו 48 שעות - שליחת תזכורת חוזרת
        Logger.log(`⏰ שולח תזכורת חוזרת ל-${phoneArr[j]}`);

        // שליחת תזכורת שוב
        const itemId = row[col['מס"ד']];
        const itemType = row[col['סוג']];
        const itemSize = row[col['מידה']];
        const itemCompany = row[col['חברה']];
        const itemColor = row[col['צבע']];
        const names = row[col['שם השואל/ משריין']] || row[col['שם השואל/משריין']] || '';
        const nameArr = names.toString().split(', ').map(n => n.trim());
        const userName = nameArr[j] || 'לקוח יקר';

        const datesStart = row[col['תאריך תחילת שיריון']] || row[col['תאריך תחילת שריון']] || '';
        const datesEnd = row[col['תאריך סיום שיריון']] || row[col['תאריך סיום שריון']] || '';
        const startArr = datesStart.toString().split(', ').map(d => d.trim());
        const endArr = datesEnd.toString().split(', ').map(d => d.trim());

        const itemDesc = `${itemType} ${itemCompany} ${itemSize} (${itemColor}) – מס"ד ${itemId}`;

        // חישוב זמן שנותר
        const hoursLeft = Math.ceil((twoDaysAgo.getTime() - sentTime.getTime()) / (1000 * 60 * 60));
        const remainingMsg = hoursLeft > 0 ? `\n⏰ נותרו ${48 - hoursLeft} שעות להשיב` : '';

        // הודעת תזכורת חוזרת
        const message = `
⏰ תזכורת נוספת

שלום ${userName}! 👋

לא קיבלנו תשובה ממך לגבי השריון.

🎿 הפריט השמור עבורך:
${itemDesc}

📅 תאריכי השריון:
מ-${startArr[j]} עד ${endArr[j]}

האם אתה מעוניין לשמור על השריון?

השב:
1️⃣ כן – לשמור על השריון
2️⃣ ביטול – לבטל את השריון
${remainingMsg}

⚠️ אם לא תענה תוך 48 שעות, השריון יבוטל אוטומטית.

תודה! ⛷️
        `.trim();

        Logger.log(`📤 שולח תזכורת חוזרת ל-${userName} (${phoneArr[j]})`);
        sendWhatsAppMessage(phoneArr[j], message);

        // עדכון זמן שליחה חדש
        const newTime = new Date();
        const newTimeStr = formatDate(newTime) + ' ' +
          String(newTime.getHours()).padStart(2, '0') + ':' +
          String(newTime.getMinutes()).padStart(2, '0');

        timeArr[j] = newTimeStr;
        sheet.getRange(i + 1, col['זמן שליחת תזכורת'] + 1)
          .setValue(timeArr.join(', '));

        Utilities.sleep(1000);
      } catch (e) {
        Logger.log(`⚠️ שגיאה בפענוח זמן: ${timeArr[j]}`);
      }
    }
  }
}

/**
 * ===========================================
 * הגדרת טריגרים אוטומטיים
 * ===========================================
 */
function setupTriggers() {
  // מחיקת טריגרים קיימים
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction().startsWith('send') ||
        trigger.getHandlerFunction().startsWith('check')) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // תזכורות החזרה - כל יום ב-9:00
  ScriptApp.newTrigger('sendReturnReminder')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  // אישורי שריון - כל יום ב-10:00
  ScriptApp.newTrigger('sendReservationConfirm')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  // בדיקת תשובות - 3 פעמים ביום: 10:00, 14:00, 18:00
  ScriptApp.newTrigger('checkPendingResponses')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('checkPendingResponses')
    .timeBased()
    .atHour(14)
    .everyDays(1)
    .create();

  ScriptApp.newTrigger('checkPendingResponses')
    .timeBased()
    .atHour(18)
    .everyDays(1)
    .create();

  Logger.log('✅ כל הטריגרים הוגדרו בהצלחה!');
}

/**
 * ===========================================
 * בדיקה ידנית
 * ===========================================
 */
function testSendMessage() {
  const testPhone = '972556625578';
  const testMessage = 'זו הודעת בדיקה מ-Apps Script! 🎿';

  Logger.log('📤 שולח הודעת בדיקה...');
  const success = sendWhatsAppMessage(testPhone, testMessage);

  if (success) {
    Logger.log('✅ הבדיקה עברה בהצלחה!');
  } else {
    Logger.log('❌ הבדיקה נכשלה - בדוק את ההגדרות');
  }
}
