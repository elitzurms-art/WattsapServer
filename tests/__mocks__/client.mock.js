function createMockClient() {
    return {
        sentMessages: [],

        sendMessage(to, body) {
            this.sentMessages.push({ to, body });
            console.log(`[MOCK CLIENT] Send to ${to}: ${body}`);
        }
    };
}

module.exports = { createMockClient };
