// handlers/reminderResponse.js
// טיפול בתשובות לתזכורות (Node.js בלבד)

const { getDoc, normalizePhone } = require('../sheets/helpers');
const { addToLog, updateInventory } = require('../sheets/inventory');
const { getSession, clearSession } = require('../sheets/sessions');

/**
 * מזהה ומטפל בתשובות לתזכורות
 * @returns {boolean}
 */
async function handleReminderResponse(client, msg, phone) {
  const text = msg.body?.trim() || '';
  const cleanText = text.toLowerCase();

  const isConfirm = ['כן', '1', 'confirm'].includes(cleanText);
  const isCancel  = ['ביטול', '2', 'cancel'].includes(cleanText);

  if (!isConfirm && !isCancel) {
    return false;
  }

  console.log(`🔔 תשובת תזכורת מ-${phone}: ${text}`);

  try
	{
		const session = await getSession(phone);


		await client.sendMessage(
		msg.from,
		`מעבד את הבקשה, אנא המתן...`
		);

		const itemIdString = session.payload; // ✅ itemIdString מגיע מה־API
		console.log(`🔎 מחפש שורה עבור טלפון ${phone} עם פריט ${itemIdString}`);

		const doc = await getDoc();
		const sheet = doc.sheetsByTitle['ניהול מלאי ממוחשב'];
		if (!sheet) {
		  console.log('❌ גיליון ניהול מלאי ממוחשב לא נמצא');
		  return false;
		}
		const rows = await sheet.getRows();
		const targetPhone = normalizePhone(phone);

		// מציאת כל השורות של המשתמש שטרם ענה עליהן
		const pendingRows = [];
		let reservationDates = null;

		for (const row of rows) {
		  const rowPhone = normalizePhone(row.get('טלפון') || '');
		  if (rowPhone !== targetPhone) continue;

		  const reservedRaw = (row.get('פריטים משוריינים') || '').toString();
		  if (!reservedRaw || reservedRaw === '') continue;

		  const confirmSent = row.get('נשלח אישור שריון');
		  if (!confirmSent) continue;

		  const response = row.get('תשובת משתמש') || '';
		  if (response && response !== '' && response !== 'null') continue; // כבר ענה

		  const startDate = row.get('תאריך תחילת שריון') || '';
		  const endDate = row.get('תאריך סיום שריון') || '';

		  // אם זה הפריט הראשון - שמור את התאריכים
		  if (!reservationDates) {
			reservationDates = `${startDate}|${endDate}`;
		  }

		  // רק פריטים עם אותם תאריכים (כי נשלחו באותה הודעה)
		  if (`${startDate}|${endDate}` === reservationDates) {
			pendingRows.push(row);
		  }
		}

		if (pendingRows.length === 0) {
		  console.log(`❌ לא נמצאו פריטים ממתינים עבור ${phone}`);
		  await clearSession(phone);
		  await client.sendMessage(
			msg.from,
			'לא נמצא שריון פעיל עבורך. אם אתה צריך עזרה – שלח "גמח סקי".'
		  );
		  return true;
		}

		console.log(`✅ נמצאו ${pendingRows.length} פריטים ממתינים לתשובה`);
		const foundRow = pendingRows[0]; // לשמירה לאחור-תאימות עם הקוד הקיים


		if (isConfirm) {
		const now = new Date();
		const timeStr =
		  `${String(now.getDate()).padStart(2, '0')}/` +
		  `${String(now.getMonth() + 1).padStart(2, '0')}/` +
		  `${String(now.getFullYear()).slice(-2)} ` +
		  `${String(now.getHours()).padStart(2, '0')}:` +
		  `${String(now.getMinutes()).padStart(2, '0')}`;

		// עדכון כל הפריטים
		for (const row of pendingRows) {
		  row.set('תשובת משתמש', "yes");
		  row.set('זמן תשובה', timeStr);
		  await row.save();
		  console.log(`✅ עודכן פריט: ${itemIdString}`);
		}

		console.log(`✅ ${pendingRows.length} פריטים אושרו עבור ${phone}`);

		await client.sendMessage(
		  msg.from,
		  `✅ תודה! השריון שלך אושר בהצלחה.\n\nנתראה בתאריך שסוכם ⛷️`
		);

		await clearSession(phone);
		return true;
		}
		else
		// ===== ביטול שריון =====
		{
		  const userName = foundRow.get('שם') || 'לא ידוע';

		  await addToLog({
			actionType: 'ביטול שריון',
			userName,
			phone,
			items: itemIdString
		  });

		  await updateInventory({
			phone,
			userName,
			action: 'remove',
			reservedItems: itemIdString
		  });

			console.log(`✅ בוטלו פריטים: ${itemIdString}`);

		  await client.sendMessage(
			msg.from,
			`✅ השריון בוטל בהצלחה.\n\n` +
			`🎿 הפריטים כעת זמינים לאחרים.`
		  );

		  await clearSession(phone);
		  return true;
		}

	}
	catch (err) {
		console.error('❌ שגיאה בטיפול בתשובת תזכורת:', err);
		await clearSession(phone);
		await client.sendMessage(
		  msg.from,
		  'אירעה שגיאה בטיפול בבקשה. אנא נסה שוב.'
		);
		return true;
	}
}

module.exports = { handleReminderResponse };
