import { rooms, isSeatingArrangement, getSeatingArrangementType, getMembersCount, normalizeSequence, generateRoomCode } from './store.js';
import db from './db.js';
import XLSX from 'xlsx';
import { JWT_SECRET } from './routes.js';
import jwt from 'jsonwebtoken';

export const setupSockets = (io) => {
// ─── Socket.IO Events ───────────────────────────────────────────────
    io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Create Room ──────────────────────────────────────────────────
    socket.on('createRoom', ({ hostName, examType, testFormat, questions, roomMode, testDuration, enableChat, email }, callback) => {
        const code = generateRoomCode();
        const cleanEmail = email ? email.toLowerCase().trim() : null;

        const user = cleanEmail ? db.prepare('SELECT role FROM users WHERE email = ?').get(cleanEmail) : null;
        const isConductor = !!(user && user.role === 'admin');

        const nextId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM test_history').get().nextId;
        const testCode = 'TS-' + (nextId + 1000);

        const room = {
            code,
            hostId: socket.id,
            hostName,
            examType,
            testFormat,
            questions,
            roomMode,  // 'friendly' or 'exam'
            testDuration,
            enableChat: enableChat !== false,
            isConductor,
            testCode,
            participants: [{ id: socket.id, name: hostName, email: cleanEmail, isHost: true, isConductor }],
            started: false,
            examStarted: false,
            results: [],
            currentQuestionIndex: 0,
            // Friendly mode: track who answered for current question
            currentAnswers: {}, // { socketId: optionIndex }
            friendlyHistory: {},
            examHistory: {},
            lastActivity: Date.now(),
        };

        rooms.set(code, room);
        socket.join(code);
        socket.roomCode = code;

        console.log(`[Room] Created: ${code} by ${hostName} (${roomMode} mode, conductor: ${isConductor})`);
        callback({ success: true, code, room: sanitizeRoom(room) });
    });

    // ── Join Room ────────────────────────────────────────────────────
    socket.on('joinRoom', ({ code, playerName, email }, callback) => {
        const room = rooms.get(code);

        if (!room) {
            return callback({ success: false, error: 'Room not found. Check the code and try again.' });
        }

        const cleanEmail = email ? email.toLowerCase().trim() : null;
        const user = cleanEmail ? db.prepare('SELECT role FROM users WHERE email = ?').get(cleanEmail) : null;
        const isConductor = !!(user && user.role === 'admin');

        // Check if player is rejoining (by email or name)
        const existingParticipant = room.participants.find(p => 
            (cleanEmail && p.email === cleanEmail) || p.name === playerName
        );

        if (existingParticipant) {
            // Rejoin!
            const oldId = existingParticipant.id;
            existingParticipant.id = socket.id;
            existingParticipant.connected = true;
            existingParticipant.isConductor = isConductor;
            let nameChanged = false;

            if (playerName && existingParticipant.name !== playerName) {
                const oldName = existingParticipant.name;
                existingParticipant.name = playerName;
                nameChanged = true;

                // Patch friendly history
                if (room.friendlyHistory && room.friendlyHistory[oldName]) {
                    room.friendlyHistory[playerName] = room.friendlyHistory[oldName];
                    delete room.friendlyHistory[oldName];
                }

                // Patch results
                if (room.results) {
                    room.results.forEach(r => {
                        if (r.playerName === oldName) {
                            r.playerName = playerName;
                        }
                    });
                }
            }

            // Migrate old answer if it exists
            if (oldId && room.currentAnswers[oldId]) {
                room.currentAnswers[socket.id] = room.currentAnswers[oldId];
                delete room.currentAnswers[oldId];
            }

            if (existingParticipant.isHost) {
                room.hostId = socket.id;
                if (room.hostDisconnectTimeout) {
                    clearTimeout(room.hostDisconnectTimeout);
                    delete room.hostDisconnectTimeout;
                    console.log(`[Room] Host reconnected to ${code}, cleared timeout.`);
                }
            }

            room.lastActivity = Date.now();
            socket.join(code);
            socket.roomCode = code;

            // Notify others
            io.to(code).emit('participantJoined', {
                participant: { name: existingParticipant.name, email: existingParticipant.email, isHost: existingParticipant.isHost, isConductor: !!existingParticipant.isConductor, connected: true },
                participants: mapParticipants(room.participants),
            });

            console.log(`[Room] ${existingParticipant.name} (conductor: ${isConductor}) rejoined ${code} (nameChanged: ${nameChanged})`);

            // If room started, return state
            if (room.started) {
                // Prepare current answered state/reveal state for friendly mode
                let friendlyRevealData = null;
                let friendlyAnswerStatus = null;

                if (room.roomMode === 'friendly') {
                    const connectedParticipants = room.participants.filter(p => p.connected !== false && !p.isConductor);
                    const connectedAnswered = connectedParticipants.filter(p => room.currentAnswers[p.id] !== undefined);
                    const answeredCount = connectedAnswered.length;
                    const totalParticipants = connectedParticipants.length;
                    const answeredPlayers = connectedAnswered.map(p => {
                        const data = room.currentAnswers[p.id];
                        return {
                            name: p.name,
                            timeSpentSec: data.timeSpentSec
                        };
                    });

                    friendlyAnswerStatus = {
                        answeredCount,
                        totalParticipants,
                        answeredPlayers
                    };

                    if (answeredCount >= totalParticipants && totalParticipants > 0) {
                        const q = room.questions[room.currentQuestionIndex];
                        const correctAnswer = q.correctAnswer;
                        const playerChoices = {};
                        for (const p of room.participants.filter(x => !x.isConductor)) {
                            const data = room.currentAnswers[p.id];
                            const isAnswerCorrect = data 
                                ? (isSeatingArrangement(q, room.testFormat) 
                                    ? normalizeSequence(data.optionIndex) === normalizeSequence(q.options[correctAnswer]) 
                                    : data.optionIndex === correctAnswer)
                                : false;
                            playerChoices[p.name] = {
                                choice: data ? data.optionIndex : -1,
                                isCorrect: isAnswerCorrect,
                                timeSpentSec: data ? data.timeSpentSec : 0
                            };
                        }
                        friendlyRevealData = {
                            questionIndex: room.currentQuestionIndex,
                            correctAnswer,
                            playerChoices
                        };
                    }
                }

                return callback({
                    success: true,
                    room: sanitizeRoom(room),
                    rejoined: true,
                    nameChanged,
                    joinedLate: false,
                    questions: room.questions,
                    currentQuestionIndex: room.currentQuestionIndex,
                    roomMode: room.roomMode,
                    friendlyAnswerStatus,
                    friendlyRevealData,
                    playerHistory: room.roomMode === 'exam' ? room.examHistory?.[existingParticipant.name] : (room.roomMode === 'friendly' ? room.friendlyHistory?.[existingParticipant.name] : null)
                });
            } else {
                return callback({
                    success: true,
                    room: sanitizeRoom(room),
                    rejoined: true,
                    nameChanged,
                });
            }
        }

        if (room.participants.length >= 20) {
            return callback({ success: false, error: 'Room is full (max 20 participants).' });
        }

        // Normal join (before start)
        const participant = { id: socket.id, name: playerName, email: cleanEmail, isHost: false, connected: true, isConductor };
        room.participants.push(participant);
        room.lastActivity = Date.now();

        socket.join(code);
        socket.roomCode = code;

        io.to(code).emit('participantJoined', {
            participant: {
                name: participant.name,
                email: participant.email,
                isHost: participant.isHost,
                isConductor: !!participant.isConductor,
                connected: true
            },
            participants: mapParticipants(room.participants),
        });

        console.log(`[Room] ${playerName} joined ${code}`);
        callback({
            success: true,
            room: sanitizeRoom(room),
        });
    });

    // ── Start Room (Host Only) ───────────────────────────────────────
    socket.on('startRoom', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room) return callback({ success: false, error: 'Room not found.' });
        if (room.hostId !== socket.id) return callback({ success: false, error: 'Only the host can start the test.' });
        if (room.participants.filter(p => !p.isConductor).length < 1) {
            return callback({ success: false, error: 'Need at least 1 participant who is not a conductor.' });
        }

        room.started = true;
        room.currentQuestionIndex = 0;
        room.currentAnswers = {};
        room.lastActivity = Date.now();
        room.startTime = Date.now();

        // Shuffle questions (Fisher-Yates) once for all participants
        const shuffled = [...room.questions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        room.questions = shuffled;

        io.to(code).emit('testStarted', {
            questions: shuffled,
            examType: room.examType,
            testFormat: room.testFormat,
            roomMode: room.roomMode,
            testDuration: room.testDuration,
            testCode: room.testCode,
        });

        console.log(`[Room] ${code} test started! (${room.roomMode} mode, serial: ${room.testCode})`);
        callback({ success: true });
    });

    // ── Start Exam (Host Only) ────────────────────────────────────────
    socket.on('startExam', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room) return callback?.({ success: false, error: 'Room not found.' });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only the host can start the exam.' });

        room.examStarted = true;
        room.lastActivity = Date.now();

        io.to(code).emit('examStarted');
        console.log(`[Room] ${code} exam started by host!`);
        callback?.({ success: true });
    });

    // ── Friendly Mode: Player answers current question ───────────────
    socket.on('friendlyAnswer', ({ code, questionIndex, optionIndex, timeSpentSec }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (questionIndex !== room.currentQuestionIndex) return callback?.({ success: false });

        room.currentAnswers[socket.id] = {
            optionIndex,
            timeSpentSec: timeSpentSec || 0
        };
        const _pName = room.participants.find(p => p.id === socket.id)?.name || 'Unknown';
        if (_pName !== 'Unknown') {
            if (!room.friendlyHistory) room.friendlyHistory = {};
            if (!room.friendlyHistory[_pName]) room.friendlyHistory[_pName] = { answers: {}, timeSpent: {} };
            room.friendlyHistory[_pName].answers[questionIndex] = optionIndex;
            room.friendlyHistory[_pName].timeSpent[questionIndex] = timeSpentSec || 0;
        }
        room.lastActivity = Date.now();

        const playerName = room.participants.find(p => p.id === socket.id)?.name || 'Unknown';

        // Broadcast how many have answered (not WHAT they answered) and their times
        const connectedParticipants = room.participants.filter(p => p.connected !== false && !p.isConductor);
        const connectedAnswered = connectedParticipants.filter(p => room.currentAnswers[p.id] !== undefined);
        const answeredCount = connectedAnswered.length;
        const totalParticipants = connectedParticipants.length;

        io.to(code).emit('friendlyAnswerStatus', {
            answeredCount,
            totalParticipants,
            answeredPlayers: connectedAnswered.map(p => {
                const data = room.currentAnswers[p.id];
                return {
                    name: p.name,
                    timeSpentSec: data.timeSpentSec
                };
            }),
        });

        console.log(`[Friendly] ${playerName} answered Q${questionIndex + 1} in ${code} in ${timeSpentSec}s (${answeredCount}/${totalParticipants})`);

        // If everyone answered, reveal the correct answer + what each player picked
        if (answeredCount >= totalParticipants && totalParticipants > 0) {
            const q = room.questions[questionIndex];
            const correctAnswer = q.correctAnswer;
            const playerChoices = {};
            for (const p of room.participants.filter(x => !x.isConductor)) {
                const data = room.currentAnswers[p.id];
                const isAnswerCorrect = data 
                    ? (isSeatingArrangement(q, room.testFormat) 
                        ? normalizeSequence(data.optionIndex) === normalizeSequence(q.options[correctAnswer]) 
                        : data.optionIndex === correctAnswer)
                    : false;
                playerChoices[p.name] = {
                    choice: data ? data.optionIndex : -1,
                    isCorrect: isAnswerCorrect,
                    timeSpentSec: data ? data.timeSpentSec : 0
                };
            }

            io.to(code).emit('friendlyReveal', {
                questionIndex,
                correctAnswer,
                playerChoices,
            });

            console.log(`[Friendly] All answered Q${questionIndex + 1} in ${code} — revealing!`);
        }

        callback?.({ success: true });
    });

    // ── Friendly Mode: Host moves to next question ───────────────────
    socket.on('friendlyNext', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only host can advance/skip questions.' });

        // In friendly mode, only host can trigger a next/skip-for-all

        room.currentQuestionIndex += 1;
        room.currentAnswers = {};
        room.lastActivity = Date.now();

        io.to(code).emit('friendlyNextQuestion', {
            questionIndex: room.currentQuestionIndex,
        });

        console.log(`[Friendly] Moving to Q${room.currentQuestionIndex + 1} in ${code}`);
        callback?.({ success: true });
    });

    // ── Friendly Mode: Host force reveals answer ──────────────────────
    socket.on('friendlyForceReveal', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only host can reveal.' });

        const qi = room.currentQuestionIndex;
        const q = room.questions[qi];
        const correctAnswer = q.correctAnswer;
        const playerChoices = {};
        for (const p of room.participants.filter(x => !x.isConductor)) {
            const data = room.currentAnswers[p.id];
            const isAnswerCorrect = data 
                ? (isSeatingArrangement(q, room.testFormat) 
                    ? normalizeSequence(data.optionIndex) === normalizeSequence(q.options[correctAnswer]) 
                    : data.optionIndex === correctAnswer)
                : false;
            playerChoices[p.name] = {
                choice: data ? data.optionIndex : -1,
                isCorrect: isAnswerCorrect,
                timeSpentSec: data ? data.timeSpentSec : 0
            };
        }

        io.to(code).emit('friendlyReveal', {
            questionIndex: qi,
            correctAnswer,
            playerChoices,
        });

        console.log(`[Friendly] Host force-revealed Q${qi + 1} in ${code}`);
        callback?.({ success: true });
    });

    // ── Friendly Mode: Host finishes exam for all ────────────────────
    socket.on('friendlyFinish', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room || room.roomMode !== 'friendly') return callback?.({ success: false });
        if (room.hostId !== socket.id) return callback?.({ success: false, error: 'Only host can finish.' });

        room.lastActivity = Date.now();
        room.examFinished = true;
        io.to(code).emit('friendlyForceSubmit');
        console.log(`[Friendly] Host force-finished exam in ${code}`);
        callback?.({ success: true });
    });

    socket.on('chatSend', ({ code, text }) => {
        const room = rooms.get(code);
        if (!room) return;
        room.lastActivity = Date.now();

        const participant = room.participants.find(p => p.id === socket.id);
        const sender = participant?.name || 'Unknown';
        const email = participant?.email || '';
        const msg = { sender, email, text: text.slice(0, 200), timestamp: Date.now() };

        io.to(code).emit('chatMessage', msg);
    });

    // ── Submit Results ───────────────────────────────────────────────
    socket.on('submitResults', ({ code, playerName, answers, timeSpent, score, total, correct, incorrect, markingScheme }, callback) => {
        const room = rooms.get(code);
        if (!room) return callback?.({ success: false, error: 'Room not found.' });
        room.lastActivity = Date.now();

        const participant = room.participants.find(p => p.id === socket.id);
        const email = participant?.email || null;

        // Prevent duplicate submissions
        const alreadySubmitted = room.results.some(r => r.playerId === socket.id || (email && r.email === email) || (r.playerName === playerName && !email && !['Guest', 'Player', 'Anonymous', 'Unknown'].includes(r.playerName)));
        if (alreadySubmitted) {
            console.log(`[Room] ${playerName} already submitted results in ${code}. Ignoring duplicate submission.`);
            return callback?.({ success: true, rank: room.results.findIndex(r => r.playerId === socket.id || (email && r.email === email) || r.playerName === playerName) + 1 });
        }

        const totalTime = timeSpent.reduce((sum, t) => sum + (t || 0), 0);

        // Calculate marks using markingScheme
        const ms = markingScheme || { correct: 2, incorrect: -0.5, unattempted: 0 };
        const localUnattempted = total - correct - incorrect;
        const marks = (correct * ms.correct) + (incorrect * ms.incorrect) + (localUnattempted * ms.unattempted);
        const maxMarks = total * ms.correct;

        room.results.push({
            playerId: socket.id,
            playerName,
            email,
            score,
            total,
            correct,
            incorrect,
            marks,
            maxMarks,
            totalTime,
            answers,
            timeSpent,
            submittedAt: Date.now(),
        });

        if (email) {
            try {
                const user = db.prepare('SELECT id, xp FROM users WHERE email = ?').get(email.toLowerCase().trim());
                if (user) {
                    const userId = user.id;
                    const ms = markingScheme || { correct: 2, incorrect: -0.5, unattempted: 0 };
                    
                    const localUnattempted = total - correct - incorrect;
                    const localTotalMarks = (correct * ms.correct) + (incorrect * ms.incorrect) + (localUnattempted * ms.unattempted);
                    const localMaxMarks = total * ms.correct;
                    const localPercentage = parseFloat(((correct / total) * 100).toFixed(1));

                    // Build topic breakdown
                    const topicBreakdown = {};
                    if (room.questions && Array.isArray(room.questions)) {
                        room.questions.forEach((q, idx) => {
                            const topic = q.subject || 'General';
                            if (!topicBreakdown[topic]) topicBreakdown[topic] = { correct: 0, total: 0 };
                            topicBreakdown[topic].total += 1;
                            if (answers[idx] !== undefined && answers[idx] === q.correctAnswer) {
                                topicBreakdown[topic].correct += 1;
                            }
                        });
                    }

                    // Save to database
                    const historyStmt = db.prepare(`
                        INSERT INTO test_history (user_id, exam_type, test_format, score, total, correct, incorrect, unattempted, total_marks, max_marks, percentage, total_time, marking_scheme, topic_breakdown, is_multiplayer, answers_json, time_spent_json, questions_json, test_code)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    const historyResult = historyStmt.run(
                        userId,
                        room.examType || 'ssc',
                        room.testFormat || 'mock',
                        score,
                        total,
                        correct,
                        incorrect,
                        localUnattempted,
                        localTotalMarks,
                        localMaxMarks,
                        localPercentage,
                        totalTime,
                        JSON.stringify(ms),
                        JSON.stringify(topicBreakdown),
                        1, // is_multiplayer
                        JSON.stringify(answers),
                        JSON.stringify(timeSpent),
                        JSON.stringify(room.questions),
                        room.testCode
                    );

                    const historyId = historyResult.lastInsertRowid;

                    // XP/Level updates
                    const xpEarned = (correct || 0) * 10 + (incorrect || 0) * 2 + 25; // 25 multiplayer bonus
                    const oldXp = user.xp || 0;
                    const newXp = oldXp + xpEarned;
                    db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, userId);

                    // Badges evaluation
                    const unlockedBadges = [];
                    if (total >= 5) {
                        const accuracy = ((correct || 0) / total) * 100;
                        if (accuracy >= 50) unlockedBadges.push('accuracy_50');
                        if (accuracy >= 75) unlockedBadges.push('accuracy_75');
                        if (accuracy === 100) unlockedBadges.push('accuracy_100');

                        // Subject mastery check
                        if (correct === total) {
                            let testSubject = '';
                            if (room.questions && Array.isArray(room.questions) && room.questions.length > 0) {
                                const firstQ = room.questions[0];
                                if (firstQ && firstQ.subject) {
                                    testSubject = firstQ.subject.toLowerCase();
                                }
                            }

                            if (testSubject.includes('reason') || testSubject.includes('intel')) {
                                unlockedBadges.push('master_reasoning');
                            } else if (testSubject.includes('quant') || testSubject.includes('math') || testSubject.includes('arith')) {
                                unlockedBadges.push('master_quant');
                            } else if (testSubject.includes('eng')) {
                                unlockedBadges.push('master_english');
                            } else if (testSubject.includes('general') || testSubject.includes('gs') || testSubject.includes('aware') || testSubject.includes('studi')) {
                                unlockedBadges.push('master_gs');
                            }
                        }
                    }

                    // Dedicated Learner badge (>= 10 tests completed)
                    const testCount = db.prepare('SELECT COUNT(*) AS count FROM test_history WHERE user_id = ?').get(userId).count;
                    if (testCount >= 10) {
                        unlockedBadges.push('dedicated_learner');
                    }

                    // Save earned badges (insert or ignore)
                    const badgeStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_key, test_history_id) VALUES (?, ?, ?)');
                    for (const badge of unlockedBadges) {
                        badgeStmt.run(userId, badge, historyId);
                    }

                    console.log(`[Room] Saved multiplayer test history for ${playerName} (${email}), history ID: ${historyId}`);
                }
            } catch (dbErr) {
                console.error('[Room] Error saving multiplayer test history:', dbErr.message);
            }
        }

        room.lastActivity = Date.now();

        const activePlayers = room.participants.filter(p => !p.isConductor);
        const totalParticipants = activePlayers.length;
        const connectedRemaining = activePlayers.filter(p => p.connected !== false && !room.results.some(r => (p.email && r.email === p.email) || r.playerName === p.name)).length;

        // Auto-submit 0-scores for disconnected users if exam is finished or everyone connected has finished
        if (room.examFinished || connectedRemaining === 0) {
            const disconnectedUnsubmitted = activePlayers.filter(p => p.connected === false && !room.results.some(r => (p.email && r.email === p.email) || r.playerName === p.name));
            for (const p of disconnectedUnsubmitted) {
                room.results.push({
                    playerId: p.id,
                    playerName: p.name,
                    email: p.email || null,
                    score: 0,
                    total: total,
                    correct: 0,
                    incorrect: 0,
                    marks: 0,
                    maxMarks: total * (markingScheme?.correct || 2),
                    totalTime: 0,
                    isDisconnected: true
                });
            }
        }

        room.results.sort((a, b) => {
            const marksA = a.marks !== undefined ? a.marks : a.score;
            const marksB = b.marks !== undefined ? b.marks : b.score;
            return marksB - marksA || a.totalTime - b.totalTime;
        });

        const allSubmitted = room.results.length === totalParticipants;

        io.to(code).emit('leaderboardUpdate', {
            results: room.results,
            participants: mapParticipants(room.participants),
            totalParticipants,
            allSubmitted,
        });

        if (allSubmitted && totalParticipants >= 3 && room.results.length > 0 && !room.gladiatorAwarded) {
            room.gladiatorAwarded = true;
            const winner = room.results[0];
            if (winner && winner.email) {
                try {
                    const winnerUser = db.prepare('SELECT id, xp FROM users WHERE email = ?').get(winner.email.toLowerCase().trim());
                    if (winnerUser) {
                        const badgeResult = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_key) VALUES (?, ?)').run(winnerUser.id, 'gladiator');
                        if (badgeResult.changes > 0) {
                            const oldXp = winnerUser.xp || 0;
                            const newXp = oldXp + 100;
                            db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, winnerUser.id);
                            console.log(`[Gladiator] Awarded Gladiator badge to ${winner.playerName} (${winner.email})`);
                        }
                    }
                } catch (e) {
                    console.error('[Gladiator] Error awarding gladiator badge:', e.message);
                }
            }
        }

        console.log(`[Room] ${playerName} submitted results in ${code} (${room.results.length}/${totalParticipants})`);
        callback?.({ success: true, rank: room.results.findIndex(r => r.playerId === socket.id) + 1 });
    });

    socket.on('restartRoom', ({ code }) => {
        const room = rooms.get(code);
        if (!room) return;
        delete room.friendlyHistory;
        delete room.examHistory;
        io.to(code).emit('roomRestarted', { roomMode: room.roomMode });
    });

    // ── Sync Exam State (Middle Submissions) ──────────────────────────
    socket.on('syncExamState', ({ code, answers, timeSpent, timeLeft }) => {
        const room = rooms.get(code);
        if (!room) return;
        const p = room.participants.find(x => x.id === socket.id);
        if (p && room.roomMode === 'exam') {
            if (!room.examHistory) room.examHistory = {};
            room.examHistory[p.name] = { answers, timeSpent, timeLeft };
        }
    });

    // ── Get Leaderboard ──────────────────────────────────────────────
    socket.on('getLeaderboard', ({ code }, callback) => {
        const room = rooms.get(code);
        if (!room) return callback({ success: false, error: 'Room not found.' });

        const activePlayers = room.participants.filter(p => !p.isConductor);
        const totalParticipants = activePlayers.length;
        const allSubmitted = room.results.length === totalParticipants;

        callback({
            success: true,
            results: room.results,
            participants: mapParticipants(room.participants),
            totalParticipants,
            allSubmitted,
        });
    });

    // ── Exam Progress Update ──────────────────────────────────────────
    socket.on('examProgress', ({ code, questionIndex, answeredCount, liveScore }) => {
        const room = rooms.get(code);
        if (!room) return;
        const participant = room.participants.find(p => p.id === socket.id);
        if (participant) {
            participant.currentQuestionIndex = questionIndex;
            participant.answeredCount = answeredCount;
            participant.liveScore = liveScore || 0;
            io.to(code).emit('examProgressUpdate', {
                participants: mapParticipants(room.participants)
            });
        }
    });

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (!code) return;

        const room = rooms.get(code);
        if (!room) return;

        const participant = room.participants.find(p => p.id === socket.id);
        if (participant) {
            if (room.started || participant.isHost) {
                participant.connected = false;
            } else {
                room.participants = room.participants.filter(p => p.id !== socket.id);
            }
        }
        room.lastActivity = Date.now();

        io.to(code).emit('participantLeft', {
            participants: mapParticipants(room.participants),
        });

        // Re-check if all remaining participants answered in friendly mode
        if (room.roomMode === 'friendly' && room.started) {
            const connectedParticipants = room.participants.filter(p => p.connected !== false && !p.isConductor);
            const connectedAnsweredCount = connectedParticipants.filter(p => room.currentAnswers[p.id] !== undefined).length;
            if (connectedParticipants.length > 0 && connectedAnsweredCount >= connectedParticipants.length) {
                const qi = room.currentQuestionIndex;
                const q = room.questions[qi];
                const correctAnswer = q.correctAnswer;
                const playerChoices = {};
                for (const p of room.participants.filter(x => !x.isConductor)) {
                    const data = room.currentAnswers[p.id];
                    const isAnswerCorrect = data 
                        ? (isSeatingArrangement(q, room.testFormat) 
                            ? normalizeSequence(data.optionIndex) === normalizeSequence(q.options[correctAnswer]) 
                            : data.optionIndex === correctAnswer)
                        : false;
                    playerChoices[p.name] = {
                        choice: data ? data.optionIndex : -1,
                        isCorrect: isAnswerCorrect,
                        timeSpentSec: data ? data.timeSpentSec : 0
                    };
                }
                io.to(code).emit('friendlyReveal', { questionIndex: qi, correctAnswer, playerChoices });
            }
        }

        if (room.hostId === socket.id && !room.started) {
            if (room.hostDisconnectTimeout) {
                clearTimeout(room.hostDisconnectTimeout);
            }
            room.hostDisconnectTimeout = setTimeout(() => {
                const currentRoom = rooms.get(code);
                if (currentRoom && !currentRoom.participants.some(p => p.isHost && p.connected)) {
                    io.to(code).emit('roomClosed', { reason: 'Host left the room.' });
                    rooms.delete(code);
                    console.log(`[Room] ${code} closed (host left timeout)`);
                }
            }, 15000); // 15 seconds grace period
        }

        console.log(`[Socket] Disconnected: ${socket.id}`);
    });
});

// ─── Helpers ─────────────────────────────────────────────────────────
function mapParticipants(participants) {
    return participants.map(p => ({
        name: p.name,
        email: p.email,
        isHost: p.isHost,
        isConductor: !!p.isConductor,
        connected: p.connected !== false,
        currentQuestionIndex: p.currentQuestionIndex || 0,
        answeredCount: p.answeredCount || 0,
        liveScore: p.liveScore || 0
    }));
}

function sanitizeRoom(room) {
    return {
        code: room.code,
        hostName: room.hostName,
        examType: room.examType,
        testFormat: room.testFormat,
        roomMode: room.roomMode,
        enableChat: room.enableChat !== false,
        isConductor: !!room.isConductor,
        testCode: room.testCode,
        testDuration: room.testDuration,
        startTime: room.startTime,
        participants: mapParticipants(room.participants),
        started: room.started,
        examStarted: !!room.examStarted,
    };
}


};