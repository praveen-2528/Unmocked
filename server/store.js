export const rooms = new Map();
export const ROOM_TTL = 10 * 60 * 1000;

export const generateRoomCode = () => {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
};

export const isSeatingArrangement = (q, testFormat) => {
    if (!q) return false;
    const isTopicFormat = testFormat === 'topic';
    const topic = (q.topic || '').toLowerCase();
    const type = (q.questionType || q.question_type || '').toLowerCase();
    return isTopicFormat && (topic.includes('seating arrangement') || type === 'seating_arrangement');
};

export const getSeatingArrangementType = (q) => {
    if (!q) return 'linear';
    const text = (q.text || q.question_text || '').toLowerCase();
    const subtopic = (q.subtopic || '').toLowerCase();
    
    if (text.includes('circular') || text.includes('circle') || text.includes('round table') || subtopic.includes('circular')) {
        return 'circular';
    }
    if (text.includes('parallel') || text.includes('two rows') || text.includes('facing each other') || subtopic.includes('parallel')) {
        return 'parallel';
    }
    return 'linear';
};

export const getMembersCount = (correctOptionText) => {
    if (!correctOptionText || typeof correctOptionText !== 'string') return 0;
    const members = correctOptionText.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return members.length;
};

export const normalizeSequence = (str) => {
    if (typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
};