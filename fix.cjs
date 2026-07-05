const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

const oldBadgeEarned = `    socket.on('badgeEarned', ({ code, badgeKey, earnedCount }) => {
        const room = rooms.get(code);
        if (!room) return;
        io.to(code).emit('userBadgeEarned', {
            userId: socket.user.id,
            userName: socket.user.name,
            badgeKey,
            earnedCount
        });
    });`;
const newBadgeEarned = `    socket.on('badgeEarned', ({ code, badgeKey, earnedCount }) => {
        const room = rooms.get(code);
        if (!room) return;
        const participant = room.participants.find(p => p.id === socket.id);
        if (!participant) return;
        io.to(code).emit('userBadgeEarned', {
            userId: participant.id,
            userName: participant.name,
            badgeKey,
            earnedCount
        });
    });`;
content = content.replace(oldBadgeEarned, newBadgeEarned);

const oldSubmit = `        // Discard any prior result from this socket ID or this email
        room.results = room.results.filter(r => r.playerId !== socket.id && (!email || r.email !== email));`;
const newSubmit = `        // Prevent duplicate submissions
        const alreadySubmitted = room.results.some(r => r.playerId === socket.id || (email && r.email === email));
        if (alreadySubmitted) {
            console.log(\`[Room] \${playerName} already submitted results in \${code}. Ignoring duplicate submission.\`);
            return callback?.({ success: true, rank: room.results.findIndex(r => r.playerId === socket.id || (email && r.email === email)) + 1 });
        }`;
content = content.replace(oldSubmit, newSubmit);

const oldGladiator = `        if (allSubmitted && totalParticipants >= 3 && room.results.length > 0) {
            const winner = room.results[0];`;
const newGladiator = `        if (allSubmitted && totalParticipants >= 3 && room.results.length > 0 && !room.gladiatorAwarded) {
            room.gladiatorAwarded = true;
            const winner = room.results[0];`;
content = content.replace(oldGladiator, newGladiator);

fs.writeFileSync('server/index.js', content, 'utf8');
console.log("Replacement done");
