module.exports = {
    normalizePhone: (p) => p.replace('@lid', ''),
    validateSelection: (text, categorizedItems) => {
        const ids = text.split(',');
        const all = [
            ...(categorizedItems.coats || []),
            ...(categorizedItems.pants || []),
            ...(categorizedItems.additional || [])
        ];

        const valid = all.filter(i => ids.includes(i.id));
        return valid.length
            ? { valid }
            : { valid: [], message: 'בחירה לא תקינה' };
    }
};