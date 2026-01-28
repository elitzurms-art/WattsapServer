// whatsapp.js
const { List } = require('whatsapp-web.js');


async function sendWhatsAppButtons(
    client,
    to,
    text,
    buttonsArray,
    title = 'גמח סקי'
) {
    try {
        if (!to || !to.endsWith('@c.us')) {
            throw new Error('יעד לא חוקי לשליחה');
		}

        if (!buttonsArray || buttonsArray.length === 0) {
            throw new Error('אין כפתורים לשליחה');
        }

        // יצירת rows לפי חוקי WhatsApp
        const rows = buttonsArray.slice(0, 10).map((btn, index) => ({
            id: String(btn.id || `btn_${index + 1}`),
            title: String(btn.title).slice(0, 24),
            description: (btn.description || '').slice(0, 72)
        }));

        const sections = [
            {
                title: 'בחר פעולה',
                rows
            }
        ];

        const list = new List(
            to,               // גוף ההודעה
            'לחץ לבחירה',       // טקסט הכפתור
            sections,
            title,              // כותרת
            'נא לבחור אפשרות'   // footer
        );

        // ✅ שליחה נכונה
        await client.sendMessage(list);
        console.log('✅ תפריט צף נשלח ל:', to);

    } catch {

     
        // גיבוי: שליחת טקסט רגיל
        let fallback = `${text}\n\n`;
        buttonsArray.forEach((b, i) => {
            fallback += `${i + 1}. ${b.title}\n`;
        });

        await client.sendMessage(to, fallback);
    }
}

/**
 * שליחת טקסט רגיל
 */
async function sendWhatsAppText(client, to, text) {
    //if (!to || !to.endsWith('@g.us')) return;
    await client.sendMessage(to, text);
}

module.exports = {
    sendWhatsAppButtons,
    sendWhatsAppText
};
