const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');
content = content.replace(/\r\n/g, '\n'); // Normalize line endings

const replacements = [
    // 1. Prevent duplicate submissions
    [
        `        // Discard any prior result from this socket ID, this email, or this name (for guests)
        room.results = room.results.filter(r => 
            r.playerId !== socket.id && 
            (email ? r.email !== email : r.playerName !== playerName)
        );`,
        `        // Prevent duplicate submissions
        const alreadySubmitted = room.results.some(r => r.playerId === socket.id || (email ? r.email === email : r.playerName === playerName));
        if (alreadySubmitted) {
            console.log(\`[Room] \${playerName} already submitted results in \${code}. Ignoring duplicate submission.\`);
            return callback?.({ success: true, rank: room.results.findIndex(r => r.playerId === socket.id || (email ? r.email === email : r.playerName === playerName)) + 1 });
        }`
    ],
    // 2. Gladiator Award - Prevent multiple awards
    [
        `        if (allSubmitted && totalParticipants >= 3 && room.results.length > 0) {
            const winner = room.results[0];`,
        `        if (allSubmitted && totalParticipants >= 3 && room.results.length > 0 && !room.gladiatorAwarded) {
            room.gladiatorAwarded = true;
            const winner = room.results[0];`
    ],
    // 3. Set examFinished flag in friendlyFinish
    [
        `    socket.on('friendlyFinish', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only host can finish.' });

        room.lastActivity = Date.now();
        io.to(code).emit('friendlyForceSubmit');`,
        `    socket.on('friendlyFinish', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only host can finish.' });

        room.lastActivity = Date.now();
        room.examFinished = true;
        io.to(code).emit('friendlyForceSubmit');`
    ],
    // 4. Auto-submit disconnected users if exam is finished
    [
        `        // Auto-submit 0-scores for disconnected users if everyone connected has finished
        if (connectedRemaining === 0) {
            const disconnectedUnsubmitted = activePlayers.filter(p => p.connected === false && !room.results.some(r => r.playerName === p.name));`,
        `        // Auto-submit 0-scores for disconnected users if exam is finished or everyone connected has finished
        if (room.examFinished || connectedRemaining === 0) {
            const disconnectedUnsubmitted = activePlayers.filter(p => p.connected === false && !room.results.some(r => r.playerName === p.name));`
    ]
];

for (const [oldStr, newStr] of replacements) {
    if (!content.includes(oldStr)) {
        console.error("Could not find string:\\n", oldStr);
    }
    content = content.replace(oldStr, newStr);
}

fs.writeFileSync('server/index.js', content, 'utf8');
console.log("Replacements complete.");
