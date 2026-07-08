const fs = require('fs');

function processFile(path, replacements) {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(/\r\n/g, '\n');
    for (const [oldStr, newStr] of replacements) {
        if (!content.includes(oldStr)) {
            console.error(`Could not find string in ${path}:\n`, oldStr);
        }
        content = content.replace(oldStr, newStr);
    }
    fs.writeFileSync(path, content, 'utf8');
}

// 1. server/index.js
processFile('server/index.js', [
    [
        `            currentAnswers: {}, // { socketId: optionIndex }\n            lastActivity: Date.now(),`,
        `            currentAnswers: {}, // { socketId: optionIndex }\n            friendlyHistory: {},\n            lastActivity: Date.now(),`
    ],
    [
        `        room.currentAnswers[socket.id] = {\n            optionIndex,\n            timeSpentSec: timeSpentSec || 0\n        };\n        room.lastActivity = Date.now();`,
        `        room.currentAnswers[socket.id] = {\n            optionIndex,\n            timeSpentSec: timeSpentSec || 0\n        };\n        const _pName = room.participants.find(p => p.id === socket.id)?.name || 'Unknown';\n        if (_pName !== 'Unknown') {\n            if (!room.friendlyHistory) room.friendlyHistory = {};\n            if (!room.friendlyHistory[_pName]) room.friendlyHistory[_pName] = { answers: {}, timeSpent: {} };\n            room.friendlyHistory[_pName].answers[questionIndex] = optionIndex;\n            room.friendlyHistory[_pName].timeSpent[questionIndex] = timeSpentSec || 0;\n        }\n        room.lastActivity = Date.now();`
    ],
    [
        `                    currentQuestionIndex: room.currentQuestionIndex,\n                    roomMode: room.roomMode,\n                    friendlyAnswerStatus,\n                    friendlyRevealData\n                });`,
        `                    currentQuestionIndex: room.currentQuestionIndex,\n                    roomMode: room.roomMode,\n                    friendlyAnswerStatus,\n                    friendlyRevealData,\n                    playerHistory: (room.roomMode === 'friendly' && room.friendlyHistory && room.friendlyHistory[existingParticipant.name]) ? room.friendlyHistory[existingParticipant.name] : null\n                });`
    ]
]);

// 2. src/pages/Lobby.jsx
processFile('src/pages/Lobby.jsx', [
    [
        `        } else {\n            for (let i = 0; i < currentIdx; i++) {\n                initialAnswers[i] = -1;\n            }\n        }\n\n        updateExamState({`,
        `        } else {\n            for (let i = 0; i < currentIdx; i++) {\n                initialAnswers[i] = -1;\n            }\n        }\n\n        if (res.playerHistory) {\n            initialAnswers = { ...initialAnswers, ...res.playerHistory.answers };\n            for (const [qIdx, t] of Object.entries(res.playerHistory.timeSpent)) {\n                initialTimeSpent[Number(qIdx)] = t;\n            }\n        }\n\n        updateExamState({`
    ]
]);

// 3. src/pages/Setup.jsx
processFile('src/pages/Setup.jsx', [
    [
        `                } else {\n                    for (let i = 0; i < currentIdx; i++) {\n                        initialAnswers[i] = -1;\n                    }\n                }\n\n                updateExamState({`,
        `                } else {\n                    for (let i = 0; i < currentIdx; i++) {\n                        initialAnswers[i] = -1;\n                    }\n                }\n\n                if (res.playerHistory) {\n                    initialAnswers = { ...initialAnswers, ...res.playerHistory.answers };\n                    for (const [qIdx, t] of Object.entries(res.playerHistory.timeSpent)) {\n                        initialTimeSpent[Number(qIdx)] = t;\n                    }\n                }\n\n                updateExamState({`
    ]
]);

console.log("Replacements complete.");
