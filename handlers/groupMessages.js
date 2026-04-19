// handlers/groupMessages.js

async function handleGroupMessage(io, msg) {
  if (!io) {
    console.error('❌ io not provided to handleGroupMessage');
    return;
  }

  io.emit('new_message', {
    message: {
      text: msg.body || 'הודעה חדשה מווטסאפ',
      createdAt: new Date(),
      sender: 'WhatsAppBot', // ניתן לשנות את השם
    },
    conversationId: 'upcoming_schedule', // מזהה הקבוע של הקבוצה שלך
  });
}

module.exports = {
  handleGroupMessage
};
