import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'unmocked_secret_key_change_in_production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// ─── In-Memory Room Store ────────────────────────────────────────────
const rooms = new Map();

const generateRoomCode = () => {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
};

// Seating Arrangement Helpers
const isSeatingArrangement = (q, testFormat) => {
    if (!q) return false;
    const isTopicFormat = testFormat === 'topic';
    const topic = (q.topic || '').toLowerCase();
    const type = (q.questionType || q.question_type || '').toLowerCase();
    return isTopicFormat && (topic.includes('seating arrangement') || type === 'seating_arrangement');
};

const getSeatingArrangementType = (q) => {
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

const getMembersCount = (correctOptionText) => {
    if (!correctOptionText || typeof correctOptionText !== 'string') return 0;
    const members = correctOptionText.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return members.length;
};

const normalizeSequence = (str) => {
    if (typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const ROOM_TTL = 3 * 60 * 60 * 1000; // 3 hours

// Auto-cleanup stale rooms
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.lastActivity > ROOM_TTL) {
            io.to(code).emit('roomClosed', { reason: 'Room expired due to inactivity.' });
            rooms.delete(code);
            console.log(`[Cleanup] Room ${code} deleted (inactive)`);
        }
    }
}, 60 * 1000);

// ─── Auth Middleware ─────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userName = decoded.name;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};


// ─── REST Endpoints ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size });
});

// ── Network Info: Return LAN IP addresses for sharing ───────────────
app.get('/api/network-info', (_req, res) => {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const [name, nets] of Object.entries(interfaces)) {
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push({ name, address: net.address });
            }
        }
    }
    res.json({ addresses });
});


// ── Auth: Register ───────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), email.toLowerCase().trim(), hash);

    const token = jwt.sign({ userId: result.lastInsertRowid, name: name.trim() }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
        token,
        user: { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim(), role: 'user' },
    });
});

// ── Auth: Login ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
});

// ── Auth: Get Current User ──────────────────────────────────────────
app.get('/api/auth/me', verifyToken, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
});

// ── History: Save Test Result ────────────────────────────────────────
app.post('/api/history', verifyToken, (req, res) => {
    const { examType, testFormat, score, total, correct, incorrect, unattempted, totalMarks, maxMarks, percentage, totalTime, markingScheme, topicBreakdown, isMultiplayer, answers, timeSpent, questions, testCode } = req.body;

    let finalTestCode = testCode;
    if (!finalTestCode) {
        const nextId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM test_history').get().nextId;
        finalTestCode = 'TS-' + (nextId + 1000);
    }

    const stmt = db.prepare(`
        INSERT INTO test_history (user_id, exam_type, test_format, score, total, correct, incorrect, unattempted, total_marks, max_marks, percentage, total_time, marking_scheme, topic_breakdown, is_multiplayer, answers_json, time_spent_json, questions_json, test_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        req.userId, examType, testFormat,
        score || 0, total || 0, correct || 0, incorrect || 0, unattempted || 0,
        totalMarks || 0, maxMarks || 0, percentage || 0, totalTime || 0,
        markingScheme ? JSON.stringify(markingScheme) : null,
        topicBreakdown ? JSON.stringify(topicBreakdown) : null,
        isMultiplayer ? 1 : 0,
        answers ? JSON.stringify(answers) : null,
        timeSpent ? JSON.stringify(timeSpent) : null,
        questions ? JSON.stringify(questions) : null,
        finalTestCode
    );

    const historyId = result.lastInsertRowid;

    // Gamification: XP & Levels calculation
    const xpEarned = (correct || 0) * 10 + (incorrect || 0) * 2 + (isMultiplayer ? 25 : 0);
    const userObj = db.prepare('SELECT xp FROM users WHERE id = ?').get(req.userId);
    const oldXp = userObj ? (userObj.xp || 0) : 0;
    const newXp = oldXp + xpEarned;
    db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, req.userId);

    const oldLevel = Math.floor(Math.sqrt(oldXp / 100)) + 1;
    const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

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
            if (questions && Array.isArray(questions) && questions.length > 0) {
                const firstQ = questions[0];
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
    const testCount = db.prepare('SELECT COUNT(*) AS count FROM test_history WHERE user_id = ?').get(req.userId).count;
    if (testCount >= 10) {
        unlockedBadges.push('dedicated_learner');
    }

    // Save earned badges (insert or ignore)
    const badgeStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_key, test_history_id) VALUES (?, ?, ?)');
    const newlyUnlocked = [];
    for (const badge of unlockedBadges) {
        const badgeResult = badgeStmt.run(req.userId, badge, historyId);
        if (badgeResult.changes > 0) {
            newlyUnlocked.push(badge);
        }
    }

    res.status(201).json({
        id: historyId,
        testCode: finalTestCode,
        xpEarned,
        oldLevel,
        newLevel,
        newlyUnlockedBadges: newlyUnlocked
    });
});

// ── Gamification: Get Friends Feed ───────────────────────────────────
app.get('/api/gamification/friends-feed', verifyToken, (req, res) => {
    try {
        const friends = db.prepare(`
            SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as friend_id
            FROM friends
            WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
        `).all(req.userId, req.userId, req.userId).map(r => r.friend_id);

        if (friends.length === 0) {
            return res.json({ feed: [] });
        }

        const placeholders = friends.map(() => '?').join(',');
        
        const testHistory = db.prepare(`
            SELECT th.id, th.user_id, u.name as userName, th.exam_type as examType, th.percentage, th.created_at as date, 'test_complete' as type
            FROM test_history th
            JOIN users u ON th.user_id = u.id
            WHERE th.user_id IN (${placeholders})
            ORDER BY th.created_at DESC
            LIMIT 15
        `).all(...friends);

        const badges = db.prepare(`
            SELECT ub.id, ub.user_id, u.name as userName, ub.badge_key as badgeKey, ub.earned_at as date, 'badge_unlock' as type
            FROM user_badges ub
            JOIN users u ON ub.user_id = u.id
            WHERE ub.user_id IN (${placeholders})
            ORDER BY ub.earned_at DESC
            LIMIT 15
        `).all(...friends);

        const feed = [...testHistory, ...badges].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

        res.json({ feed });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Gamification: Get Stats ──────────────────────────────────────────
app.get('/api/gamification/stats', verifyToken, (req, res) => {
    try {
        const userObj = db.prepare('SELECT xp FROM users WHERE id = ?').get(req.userId);
        const xp = userObj ? (userObj.xp || 0) : 0;
        const level = Math.floor(Math.sqrt(xp / 100)) + 1;
        const currentLevelMinXp = (level - 1) * (level - 1) * 100;
        const nextLevelXp = level * level * 100;

        // Daily Streak Calculation (UTC based)
        const historyDates = db.prepare(`
            SELECT date(created_at) as test_date 
            FROM test_history 
            WHERE user_id = ? 
            GROUP BY test_date 
            ORDER BY test_date DESC
        `).all(req.userId).map(row => row.test_date);

        const getUTCDateString = (date) => {
            return date.toISOString().split('T')[0];
        };

        const todayStr = getUTCDateString(new Date());
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayStr = getUTCDateString(yesterday);

        const datesSet = new Set(historyDates);
        let streak = 0;

        if (datesSet.has(todayStr)) {
            streak = 1;
            let check = new Date();
            while (true) {
                check.setUTCDate(check.getUTCDate() - 1);
                const checkStr = getUTCDateString(check);
                if (datesSet.has(checkStr)) {
                    streak++;
                } else {
                    break;
                }
            }
        } else if (datesSet.has(yesterdayStr)) {
            streak = 1;
            let check = new Date(yesterday);
            while (true) {
                check.setUTCDate(check.getUTCDate() - 1);
                const checkStr = getUTCDateString(check);
                if (datesSet.has(checkStr)) {
                    streak++;
                } else {
                    break;
                }
            }
        }

        // Activity Map: 365 Days
        const activityRows = db.prepare(`
            SELECT date(created_at) as date, COUNT(*) as count 
            FROM test_history 
            WHERE user_id = ? AND created_at >= date('now', '-365 days') 
            GROUP BY date
        `).all(req.userId);

        const activity = {};
        activityRows.forEach(row => {
            activity[row.date] = row.count;
        });

        // Badges list
        const ALL_BADGES = [
            { key: 'speed_demon', name: 'Speed Demon', description: 'Answered 5 consecutive questions correctly in under 5 seconds each' },
            { key: 'dedicated_learner', name: 'Dedicated Learner', description: 'Completed 10 or more mock tests' },
            { key: 'gladiator', name: 'Gladiator', description: 'Placed 1st in a multiplayer lobby of 3+ players' },
            { key: 'accuracy_50', name: 'Bronze Marksman', description: 'Achieved at least 50% accuracy on a test of 5+ questions' },
            { key: 'accuracy_75', name: 'Silver Marksman', description: 'Achieved at least 75% accuracy on a test of 5+ questions' },
            { key: 'accuracy_100', name: 'Gold Marksman', description: 'Achieved 100% accuracy on a test of 5+ questions' },
            { key: 'master_reasoning', name: 'Reasoning Master', description: 'Achieved 100% accuracy in a Reasoning test of 5+ questions' },
            { key: 'master_quant', name: 'Quant Master', description: 'Achieved 100% accuracy in a Quantitative Aptitude test of 5+ questions' },
            { key: 'master_english', name: 'English Master', description: 'Achieved 100% accuracy in an English test of 5+ questions' },
            { key: 'master_gs', name: 'GS Master', description: 'Achieved 100% accuracy in a General Studies test of 5+ questions' }
        ];

        const earnedBadgesRows = db.prepare('SELECT badge_key, earned_at FROM user_badges WHERE user_id = ?').all(req.userId);
        const earnedBadgesMap = new Map(earnedBadgesRows.map(r => [r.badge_key, r.earned_at]));

        const badges = ALL_BADGES.map(b => ({
            ...b,
            isUnlocked: earnedBadgesMap.has(b.key),
            earnedAt: earnedBadgesMap.get(b.key) || null
        }));

        res.json({
            xp,
            level,
            currentLevelMinXp,
            nextLevelXp,
            streak,
            activity,
            badges
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Gamification: Unlock Badge ───────────────────────────────────────
app.post('/api/gamification/unlock-badge', verifyToken, (req, res) => {
    const { badgeKey } = req.body;
    if (!badgeKey) return res.status(400).json({ error: 'badgeKey is required' });

    const validKeys = [
        'speed_demon', 'dedicated_learner', 'gladiator',
        'accuracy_50', 'accuracy_75', 'accuracy_100',
        'master_reasoning', 'master_quant', 'master_english', 'master_gs'
    ];
    if (!validKeys.includes(badgeKey)) {
        return res.status(400).json({ error: 'Invalid badge key' });
    }

    try {
        const insertStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_key) VALUES (?, ?)');
        const result = insertStmt.run(req.userId, badgeKey);

        if (result.changes > 0) {
            const userObj = db.prepare('SELECT xp FROM users WHERE id = ?').get(req.userId);
            const oldXp = userObj ? (userObj.xp || 0) : 0;
            const newXp = oldXp + 100;
            db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, req.userId);

            const oldLevel = Math.floor(Math.sqrt(oldXp / 100)) + 1;
            const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

            res.json({
                newlyUnlocked: true,
                badgeKey,
                xpEarned: 100,
                oldLevel,
                newLevel
            });
        } else {
            res.json({
                newlyUnlocked: false,
                badgeKey,
                message: 'Badge already unlocked'
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ── History: Get User's History ──────────────────────────────────────
app.get('/api/history', verifyToken, (req, res) => {
    const rows = db.prepare('SELECT * FROM test_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId);

    const history = rows.map(r => ({
        id: r.id,
        examType: r.exam_type,
        testFormat: r.test_format,
        score: r.score,
        total: r.total,
        correct: r.correct,
        incorrect: r.incorrect,
        unattempted: r.unattempted,
        totalMarks: r.total_marks,
        maxMarks: r.max_marks,
        percentage: r.percentage,
        totalTime: r.total_time,
        markingScheme: r.marking_scheme ? JSON.parse(r.marking_scheme) : null,
        topicBreakdown: r.topic_breakdown ? JSON.parse(r.topic_breakdown) : null,
        isMultiplayer: !!r.is_multiplayer,
        answers: r.answers_json ? JSON.parse(r.answers_json) : null,
        timeSpent: r.time_spent_json ? JSON.parse(r.time_spent_json) : null,
        questions: r.questions_json ? JSON.parse(r.questions_json) : null,
        testCode: r.test_code,
        date: r.created_at,
    }));

    res.json({ history });
});

// ── Admin: Middleware & Routes ───────────────────────────────────────
const verifyAdmin = (req, res, next) => {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

// Get all users
app.get('/api/admin/users', verifyToken, verifyAdmin, (req, res) => {
    const rows = db.prepare(`
        SELECT u.id, u.name, u.email, u.role, u.created_at, COUNT(h.id) AS test_count
        FROM users u
        LEFT JOIN test_history h ON u.id = h.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    `).all();
    res.json({ users: rows });
});

// Delete user
app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === req.userId) {
        return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.json({ success: true });
});

// Get all test histories
app.get('/api/admin/history', verifyToken, verifyAdmin, (req, res) => {
    const rows = db.prepare(`
        SELECT h.*, u.name AS user_name, u.email AS user_email
        FROM test_history h
        JOIN users u ON h.user_id = u.id
        ORDER BY h.created_at DESC
    `).all();

    const history = rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        examType: r.exam_type,
        testFormat: r.test_format,
        score: r.score,
        total: r.total,
        correct: r.correct,
        incorrect: r.incorrect,
        unattempted: r.unattempted,
        totalMarks: r.total_marks,
        maxMarks: r.max_marks,
        percentage: r.percentage,
        totalTime: r.total_time,
        isMultiplayer: !!r.is_multiplayer,
        testCode: r.test_code,
        date: r.created_at,
    }));
    res.json({ history });
});

// Delete single test history
app.delete('/api/admin/history/:id', verifyToken, verifyAdmin, (req, res) => {
    db.prepare('DELETE FROM test_history WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// Delete global test history matching test_code
app.delete('/api/admin/history/global/:code', verifyToken, verifyAdmin, (req, res) => {
    const result = db.prepare('DELETE FROM test_history WHERE test_code = ?').run(req.params.code);
    res.json({ success: true, count: result.changes });
});

// Get system info and stats
app.get('/api/admin/info', verifyToken, verifyAdmin, (req, res) => {
    const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    const totalTests = db.prepare('SELECT COUNT(*) AS count FROM test_history').get().count;
    const avgScore = db.prepare('SELECT AVG(percentage) AS avg_pct FROM test_history').get().avg_pct || 0;
    
    // Get database size
    const pageCount = db.pragma('page_count')[0]?.page_count || 0;
    const pageSize = db.pragma('page_size')[0]?.page_size || 0;
    const dbSizeBytes = pageCount * pageSize;

    // Get active room codes
    const activeRooms = Array.from(rooms.keys()).map(code => {
        const room = rooms.get(code);
        return {
            code,
            hostName: room.hostName,
            participantsCount: room.participants.length,
            started: room.started,
            roomMode: room.roomMode,
            examType: room.examType,
        };
    });

    res.json({
        stats: {
            totalUsers,
            totalTests,
            avgPercentage: parseFloat(avgScore.toFixed(1)),
            dbSizeMb: parseFloat((dbSizeBytes / (1024 * 1024)).toFixed(2)),
        },
        activeRooms
    });
});

// ── Shared Documents Routes ──────────────────────────────────────────
// Get list of all documents (excluding heavy base64 data for performance)
app.get('/api/documents', verifyToken, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT d.id, d.title, d.notes, d.filename, d.file_type, d.file_size, d.uploaded_by, d.created_at, u.name AS uploader_name
            FROM shared_documents d
            JOIN users u ON d.uploaded_by = u.id
            ORDER BY d.created_at DESC
        `).all();
        res.json({ documents: rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch documents: ' + err.message });
    }
});

// Get single document (including the base64 file data for download)
app.get('/api/documents/:id', verifyToken, (req, res) => {
    try {
        const doc = db.prepare('SELECT * FROM shared_documents WHERE id = ?').get(req.params.id);
        if (!doc) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ document: doc });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch document: ' + err.message });
    }
});

// Upload a new document (Admin only)
app.post('/api/admin/documents', verifyToken, verifyAdmin, (req, res) => {
    const { title, notes, filename, fileType, fileSize, fileData } = req.body;
    if (!title || !filename || !fileData) {
        return res.status(400).json({ error: 'Title, filename, and file data are required.' });
    }
    try {
        const result = db.prepare(`
            INSERT INTO shared_documents (title, notes, filename, file_type, file_size, file_data, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(title.trim(), notes ? notes.trim() : '', filename, fileType, fileSize || 0, fileData, req.userId);
        
        res.status(201).json({
            success: true,
            document: {
                id: result.lastInsertRowid,
                title: title.trim(),
                notes: notes ? notes.trim() : '',
                filename,
                file_type: fileType,
                file_size: fileSize || 0,
                uploaded_by: req.userId,
                created_at: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload document: ' + err.message });
    }
});

// Delete a document (Admin only)
app.delete('/api/admin/documents/:id', verifyToken, verifyAdmin, (req, res) => {
    try {
        const result = db.prepare('DELETE FROM shared_documents WHERE id = ?').run(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete document: ' + err.message });
    }
});

// ── History: Get Specific History Item Detail ────────────────────────
app.get('/api/history/:id', verifyToken, (req, res) => {
    const r = db.prepare('SELECT * FROM test_history WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'History record not found.' });

    const detail = {
        id: r.id,
        userId: r.user_id,
        examType: r.exam_type,
        testFormat: r.test_format,
        score: r.score,
        total: r.total,
        correct: r.correct,
        incorrect: r.incorrect,
        unattempted: r.unattempted,
        totalMarks: r.total_marks,
        maxMarks: r.max_marks,
        percentage: r.percentage,
        totalTime: r.total_time,
        markingScheme: r.marking_scheme ? JSON.parse(r.marking_scheme) : null,
        topicBreakdown: r.topic_breakdown ? JSON.parse(r.topic_breakdown) : null,
        isMultiplayer: !!r.is_multiplayer,
        answers: r.answers_json ? JSON.parse(r.answers_json) : null,
        timeSpent: r.time_spent_json ? JSON.parse(r.time_spent_json) : null,
        questions: r.questions_json ? JSON.parse(r.questions_json) : null,
        date: r.created_at,
    };

    res.json({ detail });
});

// ── Users: Get User's Public Profile & History ───────────────────────
app.get('/api/users/profile', verifyToken, (req, res) => {
    let { email, name } = req.query;

    // Clean inputs: treat literal string representations of null/undefined or empty space as null
    if (email === 'undefined' || email === 'null' || !email || email.trim() === '') email = null;
    if (name === 'undefined' || name === 'null' || !name || name.trim() === '') name = null;

    let userRow;
    if (email) {
        userRow = db.prepare('SELECT id, name, email, xp FROM users WHERE email = ?').get(email.toLowerCase().trim());
    } else if (name) {
        userRow = db.prepare('SELECT id, name, email, xp FROM users WHERE name = ?').get(name.trim());
    } else {
        userRow = db.prepare('SELECT id, name, email, xp FROM users WHERE id = ?').get(req.userId);
    }

    if (!userRow) {
        const guestName = name ? name.trim() : (email ? email.split('@')[0] : 'Guest');
        const ALL_BADGES = [
            { key: 'speed_demon', name: 'Speed Demon', description: 'Answered 5 consecutive questions correctly in under 5 seconds each' },
            { key: 'dedicated_learner', name: 'Dedicated Learner', description: 'Completed 10 or more mock tests' },
            { key: 'gladiator', name: 'Gladiator', description: 'Placed 1st in a multiplayer lobby of 3+ players' },
            { key: 'accuracy_50', name: 'Bronze Marksman', description: 'Achieved at least 50% accuracy on a test of 5+ questions' },
            { key: 'accuracy_75', name: 'Silver Marksman', description: 'Achieved at least 75% accuracy on a test of 5+ questions' },
            { key: 'accuracy_100', name: 'Gold Marksman', description: 'Achieved 100% accuracy on a test of 5+ questions' },
            { key: 'master_reasoning', name: 'Reasoning Master', description: 'Achieved 100% accuracy in a Reasoning test of 5+ questions' },
            { key: 'master_quant', name: 'Quant Master', description: 'Achieved 100% accuracy in a Quantitative Aptitude test of 5+ questions' },
            { key: 'master_english', name: 'English Master', description: 'Achieved 100% accuracy in an English test of 5+ questions' },
            { key: 'master_gs', name: 'GS Master', description: 'Achieved 100% accuracy in a General Studies test of 5+ questions' }
        ];
        return res.json({
            user: {
                id: null,
                name: guestName,
                email: email ? email.toLowerCase().trim() : 'Guest Account',
                xp: 0,
                level: 1,
                currentLevelMinXp: 0,
                nextLevelXp: 100,
                streak: 0,
                activity: {},
                badges: ALL_BADGES.map(b => ({ ...b, isUnlocked: false, earnedAt: null }))
            },
            history: []
        });
    }

    const xp = userRow.xp || 0;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;
    const currentLevelMinXp = (level - 1) * (level - 1) * 100;
    const nextLevelXp = level * level * 100;

    // Daily Streak Calculation (UTC based)
    const historyDates = db.prepare(`
        SELECT date(created_at) as test_date 
        FROM test_history 
        WHERE user_id = ? 
        GROUP BY test_date 
        ORDER BY test_date DESC
    `).all(userRow.id).map(row => row.test_date);

    const getUTCDateString = (date) => {
        return date.toISOString().split('T')[0];
    };

    const todayStr = getUTCDateString(new Date());
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = getUTCDateString(yesterday);

    const datesSet = new Set(historyDates);
    let streak = 0;

    if (datesSet.has(todayStr)) {
        streak = 1;
        let check = new Date();
        while (true) {
            check.setUTCDate(check.getUTCDate() - 1);
            const checkStr = getUTCDateString(check);
            if (datesSet.has(checkStr)) {
                streak++;
            } else {
                break;
            }
        }
    } else if (datesSet.has(yesterdayStr)) {
        streak = 1;
        let check = new Date(yesterday);
        while (true) {
            check.setUTCDate(check.getUTCDate() - 1);
            const checkStr = getUTCDateString(check);
            if (datesSet.has(checkStr)) {
                streak++;
            } else {
                break;
            }
        }
    }

    // Activity Map: 365 Days
    const activityRows = db.prepare(`
        SELECT date(created_at) as date, COUNT(*) as count 
        FROM test_history 
        WHERE user_id = ? AND created_at >= date('now', '-365 days') 
        GROUP BY date
    `).all(userRow.id);

    const activity = {};
    activityRows.forEach(row => {
        activity[row.date] = row.count;
    });

    // Badges list
    const ALL_BADGES = [
        { key: 'speed_demon', name: 'Speed Demon', description: 'Answered 5 consecutive questions correctly in under 5 seconds each' },
        { key: 'dedicated_learner', name: 'Dedicated Learner', description: 'Completed 10 or more mock tests' },
        { key: 'gladiator', name: 'Gladiator', description: 'Placed 1st in a multiplayer lobby of 3+ players' },
        { key: 'accuracy_50', name: 'Bronze Marksman', description: 'Achieved at least 50% accuracy on a test of 5+ questions' },
        { key: 'accuracy_75', name: 'Silver Marksman', description: 'Achieved at least 75% accuracy on a test of 5+ questions' },
        { key: 'accuracy_100', name: 'Gold Marksman', description: 'Achieved 100% accuracy on a test of 5+ questions' },
        { key: 'master_reasoning', name: 'Reasoning Master', description: 'Achieved 100% accuracy in a Reasoning test of 5+ questions' },
        { key: 'master_quant', name: 'Quant Master', description: 'Achieved 100% accuracy in a Quantitative Aptitude test of 5+ questions' },
        { key: 'master_english', name: 'English Master', description: 'Achieved 100% accuracy in an English test of 5+ questions' },
        { key: 'master_gs', name: 'GS Master', description: 'Achieved 100% accuracy in a General Studies test of 5+ questions' }
    ];

    const earnedBadgesRows = db.prepare('SELECT badge_key, earned_at FROM user_badges WHERE user_id = ?').all(userRow.id);
    const earnedBadgesMap = new Map(earnedBadgesRows.map(r => [r.badge_key, r.earned_at]));

    const badges = ALL_BADGES.map(b => ({
        ...b,
        isUnlocked: earnedBadgesMap.has(b.key),
        earnedAt: earnedBadgesMap.get(b.key) || null
    }));

    // Get their test history (only columns needed for list)
    const rows = db.prepare(`
        SELECT id, exam_type, test_format, score, total, correct, incorrect, unattempted, percentage, total_time, created_at
        FROM test_history 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 50
    `).all(userRow.id);

    const history = rows.map(r => ({
        id: r.id,
        examType: r.exam_type,
        testFormat: r.test_format,
        score: r.score,
        total: r.total,
        correct: r.correct,
        incorrect: r.incorrect,
        unattempted: r.unattempted,
        percentage: r.percentage,
        totalTime: r.total_time,
        date: r.created_at,
    }));

    res.json({
        user: {
            id: userRow.id,
            name: userRow.name,
            email: userRow.email,
            xp,
            level,
            currentLevelMinXp,
            nextLevelXp,
            streak,
            activity,
            badges
        },
        history
    });
});

// ── History: Clear ───────────────────────────────────────────────────
app.delete('/api/history', verifyToken, (req, res) => {
    try {
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (user.email === 'test@test.com') {
            const rows = db.prepare('SELECT questions_json FROM test_history WHERE user_id = ?').all(req.userId);
            const deleteStmt = db.prepare('DELETE FROM test_history WHERE questions_json = ?');
            db.transaction((items) => {
                for (const item of items) {
                    if (item.questions_json) {
                        deleteStmt.run(item.questions_json);
                    }
                }
            })(rows);
            db.prepare('DELETE FROM test_history WHERE user_id = ?').run(req.userId);
        } else {
            db.prepare('DELETE FROM test_history WHERE user_id = ?').run(req.userId);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear history: ' + err.message });
    }
});

// ── History: Delete Single Test ──────────────────────────────────────
app.delete('/api/history/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    try {
        const row = db.prepare('SELECT id, user_id, questions_json FROM test_history WHERE id = ?').get(id);
        if (!row) {
            return res.status(404).json({ error: 'Test history item not found.' });
        }
        if (row.user_id !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized to delete this history item.' });
        }

        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (user.email === 'test@test.com') {
            if (row.questions_json) {
                db.prepare('DELETE FROM test_history WHERE questions_json = ?').run(row.questions_json);
            } else {
                db.prepare('DELETE FROM test_history WHERE id = ?').run(id);
            }
        } else {
            db.prepare('DELETE FROM test_history WHERE id = ?').run(id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete test: ' + err.message });
    }
});

// ── Auth: Change Password ───────────────────────────────────────────
app.put('/api/auth/password', verifyToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both current and new password required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
    res.json({ success: true });
});

// ── Auth: Update Profile ─────────────────────────────────────────────
app.put('/api/auth/profile', verifyToken, (req, res) => {
    const { name, email } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
        return res.status(400).json({ error: 'Name is required.' });
    }

    if (email !== undefined) {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(trimmedEmail, req.userId);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
    }

    try {
        const currentUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const finalName = name !== undefined ? name.trim() : currentUser.name;
        const finalEmail = email !== undefined ? email.trim().toLowerCase() : currentUser.email;

        db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(finalName, finalEmail, req.userId);
        res.json({ success: true, name: finalName, email: finalEmail });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile: ' + err.message });
    }
});

// ── Global Leaderboard ──────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
    const rows = db.prepare(`
        SELECT u.id, u.name, u.email,
            COUNT(h.id) as tests_taken,
            ROUND(AVG(h.percentage), 1) as avg_score,
            ROUND(MAX(h.percentage), 1) as best_score,
            SUM(h.total_time) as total_time
        FROM users u
        JOIN test_history h ON h.user_id = u.id
        GROUP BY u.id
        HAVING tests_taken >= 1
        ORDER BY avg_score DESC
        LIMIT 20
    `).all();

    res.json({ leaderboard: rows });
});

// ── Friends: Send Request ───────────────────────────────────────────
app.post('/api/friends/request', verifyToken, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const friend = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), req.userId);
    if (!friend) return res.status(404).json({ error: 'User not found.' });

    // Check if already friends or pending
    const existing = db.prepare('SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').get(req.userId, friend.id, friend.id, req.userId);
    if (existing) {
        if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends.' });
        return res.status(409).json({ error: 'Friend request already pending.' });
    }

    db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)').run(req.userId, friend.id, 'pending');
    res.status(201).json({ success: true });
});

// ── Friends: Accept Request ─────────────────────────────────────────
app.post('/api/friends/accept/:id', verifyToken, (req, res) => {
    const fr = db.prepare('SELECT * FROM friends WHERE id = ? AND friend_id = ? AND status = ?').get(req.params.id, req.userId, 'pending');
    if (!fr) return res.status(404).json({ error: 'Friend request not found.' });

    db.prepare('UPDATE friends SET status = ? WHERE id = ?').run('accepted', fr.id);
    res.json({ success: true });
});

// ── Friends: Remove ─────────────────────────────────────────────────
app.delete('/api/friends/:id', verifyToken, (req, res) => {
    const result = db.prepare('DELETE FROM friends WHERE id = ? AND (user_id = ? OR friend_id = ?)').run(req.params.id, req.userId, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
});

// ── Friends: List ───────────────────────────────────────────────────
app.get('/api/friends', verifyToken, (req, res) => {
    // Friends where I am user_id or friend_id and status is accepted
    const accepted = db.prepare(`
        SELECT f.id as friendshipId, f.created_at,
            CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END as friendUserId,
            CASE WHEN f.user_id = ? THEN u2.name ELSE u1.name END as friendName,
            CASE WHEN f.user_id = ? THEN u2.email ELSE u1.email END as friendEmail
        FROM friends f
        JOIN users u1 ON f.user_id = u1.id
        JOIN users u2 ON f.friend_id = u2.id
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    `).all(req.userId, req.userId, req.userId, req.userId, req.userId);

    // Pending requests TO me
    const pending = db.prepare(`
        SELECT f.id as friendshipId, f.created_at, u.name as fromName, u.email as fromEmail, u.id as fromId
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
    `).all(req.userId);

    // Requests I sent (pending)
    const sent = db.prepare(`
        SELECT f.id as friendshipId, f.created_at, u.name as toName, u.email as toEmail
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
    `).all(req.userId);

    res.json({ friends: accepted, pending, sent });
});

// ── Friends: Get Friend Stats ───────────────────────────────────────
app.get('/api/friends/:userId/stats', verifyToken, (req, res) => {
    const targetId = parseInt(req.params.userId);
    // Verify friendship
    const friendship = db.prepare(
        'SELECT id FROM friends WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = ?'
    ).get(req.userId, targetId, targetId, req.userId, 'accepted');
    if (!friendship) return res.status(403).json({ error: 'Not friends with this user.' });

    const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(targetId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const stats = db.prepare(`
        SELECT COUNT(*) as testsTaken,
            ROUND(AVG(percentage), 1) as avgScore,
            ROUND(MAX(percentage), 1) as bestScore,
            SUM(total_time) as totalTime,
            SUM(correct) as totalCorrect,
            SUM(incorrect) as totalIncorrect
        FROM test_history WHERE user_id = ?
    `).get(targetId);

    const recentTests = db.prepare(`
        SELECT exam_type, score, total, percentage, total_time, created_at, is_multiplayer
        FROM test_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(targetId);

    res.json({ user, stats, recentTests });
});

// ── Questions: List (with filters) ──────────────────────────────────
app.get('/api/questions', verifyToken, (req, res) => {
    const { subject, search, difficulty, topic, page = 1 } = req.query;
    const limit = 50;
    const offset = (parseInt(page) - 1) * limit;

    let where = 'WHERE user_id = ?';
    const params = [req.userId];

    if (subject) { where += ' AND subject = ?'; params.push(subject); }
    if (difficulty) { where += ' AND difficulty = ?'; params.push(difficulty); }
    if (topic) { where += ' AND topic = ?'; params.push(topic); }
    if (search) { where += ' AND question_text LIKE ?'; params.push(`%${search}%`); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM questions ${where}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM questions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    const questions = rows.map(r => {
        const parsedOptions = JSON.parse(r.options);
        const correctVal = parsedOptions[r.correct_answer] || '';
        return {
            id: r.id,
            text: r.question_text,
            options: parsedOptions,
            correctAnswer: r.correct_answer,
            explanation: r.explanation,
            subject: r.subject,
            topic: r.topic || '',
            subtopic: r.subtopic,
            difficulty: r.difficulty,
            questionType: r.question_type || 'MCQ',
            examType: r.exam_type,
            membersCount: getMembersCount(correctVal),
            arrangementType: getSeatingArrangementType({ text: r.question_text, subtopic: r.subtopic })
        };
    });

    const subjects = db.prepare('SELECT DISTINCT subject FROM questions WHERE user_id = ? ORDER BY subject').all(req.userId).map(r => r.subject);
    const topics = db.prepare("SELECT DISTINCT topic FROM questions WHERE user_id = ? AND topic != '' ORDER BY topic").all(req.userId).map(r => r.topic);

    res.json({ questions, total, subjects, topics, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// ── Questions: Add Single ───────────────────────────────────────────
app.post('/api/questions', verifyToken, (req, res) => {
    const { text, options, correctAnswer, explanation, subject, topic, subtopic, difficulty, questionType, examType } = req.body;

    if (!text || !options || correctAnswer === undefined) {
        return res.status(400).json({ error: 'Question text, options, and correct answer are required.' });
    }

    const result = db.prepare(`
        INSERT INTO questions (user_id, question_text, options, correct_answer, explanation, subject, topic, subtopic, difficulty, question_type, exam_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, text, JSON.stringify(options), correctAnswer, explanation || '', subject || 'General', topic || '', subtopic || '', difficulty || 'medium', questionType || 'MCQ', examType || 'ssc');

    res.status(201).json({ id: result.lastInsertRowid });
});

// ── Questions: Bulk Import ──────────────────────────────────────────
app.post('/api/questions/bulk', verifyToken, (req, res) => {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Provide an array of questions.' });
    }

    const stmt = db.prepare(`
        INSERT INTO questions (user_id, question_text, options, correct_answer, explanation, subject, topic, subtopic, difficulty, question_type, exam_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
        let count = 0;
        for (const q of items) {
            let text = q.text || q.question || '';
            let options = q.options;
            let correctAnswer = q.correctAnswer;
            let explanation = q.explanation || '';

            if (options && !Array.isArray(options)) {
                const keys = Object.keys(options).sort();
                const optArr = keys.map(k => options[k]);
                correctAnswer = keys.indexOf(q.correct_option);
                options = optArr;
            }

            if (!text || !options || correctAnswer === undefined) continue;

            stmt.run(
                req.userId, text, JSON.stringify(options), correctAnswer,
                explanation, q.subject || q.subtopic || 'General', q.topic || '', q.subtopic || '', q.difficulty || 'medium', q.questionType || q.question_type || 'MCQ', q.examType || q.exam_type || 'ssc'
            );
            count++;
        }
        return count;
    });

    const imported = insertMany(questions);
    res.status(201).json({ imported });
});

// ── Questions: Update ───────────────────────────────────────────────
app.put('/api/questions/:id', verifyToken, (req, res) => {
    const { text, options, correctAnswer, explanation, subject, topic, subtopic, difficulty, questionType } = req.body;
    const q = db.prepare('SELECT id FROM questions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!q) return res.status(404).json({ error: 'Question not found.' });

    db.prepare(`
        UPDATE questions SET question_text=?, options=?, correct_answer=?, explanation=?, subject=?, topic=?, subtopic=?, difficulty=?, question_type=?
        WHERE id=? AND user_id=?
    `).run(text, JSON.stringify(options), correctAnswer, explanation || '', subject || 'General', topic || '', subtopic || '', difficulty || 'medium', questionType || 'MCQ', req.params.id, req.userId);

    res.json({ success: true });
});

// ── Questions: Delete ───────────────────────────────────────────────
app.delete('/api/questions/:id', verifyToken, (req, res) => {
    const result = db.prepare('DELETE FROM questions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Question not found.' });
    res.json({ success: true });
});

// ── Questions: Generate Test ────────────────────────────────────────
app.post('/api/questions/generate', verifyToken, (req, res) => {
    const { subject, count = 25 } = req.body;
    let where = 'WHERE user_id = ?';
    const params = [req.userId];

    if (subject && subject !== 'all') { where += ' AND subject = ?'; params.push(subject); }

    const rows = db.prepare(`SELECT * FROM questions ${where} ORDER BY RANDOM() LIMIT ?`).all(...params, parseInt(count));

    if (rows.length === 0) {
        return res.status(404).json({ error: 'No questions found. Import some questions first.' });
    }

    const questions = rows.map(r => {
        const parsedOptions = JSON.parse(r.options);
        const correctVal = parsedOptions[r.correct_answer] || '';
        return {
            id: r.id,
            text: r.question_text,
            options: parsedOptions,
            correctAnswer: r.correct_answer,
            explanation: r.explanation,
            subject: r.subject,
            topic: r.topic || '',
            subtopic: r.subtopic,
            difficulty: r.difficulty,
            questionType: r.question_type || 'MCQ',
            membersCount: getMembersCount(correctVal),
            arrangementType: getSeatingArrangementType({ text: r.question_text, subtopic: r.subtopic })
        };
    });

    res.json({ questions });
});

// ── Questions: Generate for Room (with exam_type filter) ────────────
app.post('/api/questions/generate-for-room', verifyToken, (req, res) => {
    const { examType, subject, topic, count = 25 } = req.body;
    let where = 'WHERE user_id = ?';
    const params = [req.userId];

    if (examType && examType !== 'all') { where += ' AND exam_type = ?'; params.push(examType); }
    if (subject && subject !== 'all') { where += ' AND subject = ?'; params.push(subject); }
    if (topic && topic !== 'all') { where += ' AND topic = ?'; params.push(topic); }

    const rows = db.prepare(`SELECT * FROM questions ${where} ORDER BY RANDOM() LIMIT ?`).all(...params, parseInt(count));

    if (rows.length === 0) {
        return res.status(404).json({ error: 'No questions found for this selection. Import some questions first.' });
    }

    const questions = rows.map(r => {
        const parsedOptions = JSON.parse(r.options);
        const correctVal = parsedOptions[r.correct_answer] || '';
        return {
            id: r.id,
            text: r.question_text,
            options: parsedOptions,
            correctAnswer: r.correct_answer,
            explanation: r.explanation,
            subject: r.subject,
            topic: r.topic || '',
            subtopic: r.subtopic,
            difficulty: r.difficulty,
            questionType: r.question_type || 'MCQ',
            membersCount: getMembersCount(correctVal),
            arrangementType: getSeatingArrangementType({ text: r.question_text, subtopic: r.subtopic })
        };
    });

    res.json({ questions, total: questions.length });
});

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

app.post('/api/ai/generate', verifyToken, async (req, res) => {
    const { subject, topic, count = 10, difficulty = 'medium', examType = 'ssc_cgl_tier1', optionsCount = 4 } = req.body;

    if (!subject) return res.status(400).json({ error: 'Subject is required.' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable.' });

    const safeCount = Math.min(Math.max(parseInt(count) || 10, 1), 50);
    const optionLetters = Array.from({ length: optionsCount }, (_, i) => String.fromCharCode(65 + i));

    const prompt = `Generate exactly ${safeCount} multiple-choice questions for a competitive exam.

Requirements:
- Subject: ${subject}
${topic ? `- Topic: ${topic}` : ''}
- Difficulty: ${difficulty}
- Each question must have exactly ${optionsCount} options (${optionLetters.join(', ')})
- For questions that contain multiple statements, premises, or conclusions (such as Syllogisms, Assertion-Reason, or passage-based questions), format the question text to put each statement/premise/conclusion on a new line using a newline character (\\n) for readability.
- Return ONLY a valid JSON array, no markdown, no explanation
- Each object must have these exact keys:
  {
    "question": "the question text",
    "options": { ${optionLetters.map(l => `"${l}": "option text"`).join(', ')} },
    "correct_option": "${optionLetters[0]}",
    "explanation": "why this is correct",
    "subject": "${subject}",
    "topic": "${topic || subject}",
    "subtopic": "specific subtopic",
    "difficulty": "${difficulty}",
    "question_type": "MCQ"
  }

Return ONLY the JSON array. No other text.`;

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 8000,
            }),
        });

        if (!response.ok) {
            const errData = await response.text();
            console.error('DeepSeek API error:', errData);
            return res.status(502).json({ error: 'DeepSeek API returned an error. Check your API key.' });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse JSON from the response (handle markdown code blocks)
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const generated = JSON.parse(jsonStr);

        if (!Array.isArray(generated)) {
            return res.status(500).json({ error: 'AI returned invalid format. Please try again.' });
        }

        // Normalize to UnMocked format
        const questions = generated.map((q, i) => {
            const opts = q.options;
            let optionsArray, correctAnswer;
            if (Array.isArray(opts)) {
                optionsArray = opts;
                correctAnswer = typeof q.correct_option === 'number' ? q.correct_option : 0;
            } else {
                const keys = Object.keys(opts).sort();
                optionsArray = keys.map(k => opts[k]);
                correctAnswer = keys.indexOf(q.correct_option);
                if (correctAnswer < 0) correctAnswer = 0;
            }
            return {
                text: (q.question || q.text || `Question ${i + 1}`).toString().split('\\n').join('\n'),
                options: optionsArray.map(o => (o || '').toString().split('\\n').join('\n')),
                correctAnswer,
                explanation: (q.explanation || '').toString().split('\\n').join('\n'),
                subject: q.subject || subject,
                topic: q.topic || topic || '',
                subtopic: q.subtopic || '',
                difficulty: q.difficulty || difficulty,
                questionType: q.question_type || 'MCQ',
                examType: examType,
            };
        });

        res.json({ questions, raw_count: generated.length });
    } catch (err) {
        console.error('AI generation error:', err);
        res.status(500).json({ error: `AI generation failed: ${err.message}` });
    }
});

// ── Mocks: Save Full Mock Test ──────────────────────────────────────────────
app.post('/api/mocks', verifyToken, (req, res) => {
    const { examTemplateId, name, questions } = req.body;
    if (!examTemplateId || !name || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or valid questions.' });
    }

    try {
        const insertMock = db.prepare('INSERT INTO mock_tests (user_id, exam_template_id, name) VALUES (?, ?, ?)');
        const insertQuestion = db.prepare(`
            INSERT INTO questions (user_id, mock_test_id, question_text, options, correct_answer, explanation, subject, subtopic, difficulty, exam_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.transaction(() => {
            const mockRes = insertMock.run(req.userId, examTemplateId, name);
            const mockId = mockRes.lastInsertRowid;

            for (const q of questions) {
                insertQuestion.run(
                    req.userId, mockId, q.text, JSON.stringify(q.options), q.correctAnswer,
                    q.explanation || '', q.subject || 'General', q.subtopic || '',
                    q.difficulty || 'medium', examTemplateId
                );
            }
        })();

        res.json({ success: true, message: `Mock test saved with ${questions.length} questions.` });
    } catch (err) {
        console.error('Error saving mock test:', err);
        res.status(500).json({ error: 'Database error saving mock test.' });
    }
});

// ── Mocks: List Saved Mocks ─────────────────────────────────────────────────
app.get('/api/mocks', verifyToken, (req, res) => {
    const rows = db.prepare(`
        SELECT m.*, COUNT(q.id) as question_count 
        FROM mock_tests m 
        LEFT JOIN questions q ON m.id = q.mock_test_id 
        WHERE m.user_id = ? 
        GROUP BY m.id 
        ORDER BY m.created_at DESC
    `).all(req.userId);
    res.json({ mocks: rows });
});

// ── Mocks: Get Mock Test Questions for Starting ──────────────────────────────
app.get('/api/mocks/:id/start', verifyToken, (req, res) => {
    const mockId = req.params.id;
    // Verify ownership
    const mock = db.prepare('SELECT * FROM mock_tests WHERE id = ? AND user_id = ?').get(mockId, req.userId);
    if (!mock) return res.status(404).json({ error: 'Mock test not found.' });

    const rows = db.prepare('SELECT * FROM questions WHERE mock_test_id = ? AND user_id = ?').all(mockId, req.userId);

    const questions = rows.map(r => {
        const parsedOptions = JSON.parse(r.options);
        const correctVal = parsedOptions[r.correct_answer] || '';
        return {
            id: r.id,
            text: r.question_text,
            options: parsedOptions,
            correctAnswer: r.correct_answer,
            explanation: r.explanation,
            subject: r.subject,
            topic: r.topic || '',
            subtopic: r.subtopic,
            difficulty: r.difficulty,
            examType: r.exam_type,
            questionType: r.question_type || 'MCQ',
            membersCount: getMembersCount(correctVal),
            arrangementType: getSeatingArrangementType({ text: r.question_text, subtopic: r.subtopic })
        };
    });

    res.json({ mock, questions });
});

// ── Rooms: Get Active Rooms on Local Network ─────────────────────────────
app.get('/api/active-rooms', (req, res) => {
    const active = [];
    for (const [code, room] of rooms.entries()) {
        active.push({
            code,
            hostName: room.hostName,
            examType: room.examType,
            testFormat: room.testFormat,
            roomMode: room.roomMode,
            started: room.started,
            participantCount: room.participants.length,
            participants: room.participants.map(p => ({
                name: p.name,
                isHost: p.isHost,
                connected: p.connected !== false,
                hasSubmitted: room.results?.some(r => r.playerName === p.name) || false
            }))
        });
    }
    res.json({ success: true, rooms: active });
});

// ── Rooms: Get Specific Room Details ─────────────────────────────────────
app.get('/api/rooms/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const room = rooms.get(code);
    if (!room) {
        return res.status(404).json({ success: false, error: 'Room not found.' });
    }
    res.json({
        success: true,
        room: {
            code,
            hostName: room.hostName,
            examType: room.examType,
            testFormat: room.testFormat,
            roomMode: room.roomMode,
            started: room.started,
            participants: room.participants.map(p => ({
                name: p.name,
                isHost: p.isHost,
                connected: p.connected !== false,
                hasSubmitted: room.results?.some(r => r.playerName === p.name) || false
            }))
        }
    });
});

// Helper: Convert Excel date serial to standard YYYY-MM-DD string
function excelDateToJSDateStr(serial) {
    if (typeof serial !== 'number') return String(serial);
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
}

// ── Schedule: Get Today's and Full Study Schedule ──────────────────────────
app.get('/api/schedule/today', verifyToken, (req, res) => {
    try {
        const xlsxPath = join(__dirname, '..', 'Schedule.xlsx');
        const workbook = XLSX.readFile(xlsxPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const d = new Date();
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        const todayStr = localDate.toISOString().split('T')[0];

        const todaySchedule = data.find(row => {
            const rowDateStr = excelDateToJSDateStr(row.Date);
            return rowDateStr === todayStr;
        });

        let schedule = null;
        if (todaySchedule) {
            schedule = {
                date: todayStr,
                day: todaySchedule.Day,
                topic1: todaySchedule['Topic 1'] || todaySchedule['Topic1'] || '',
                topic2: todaySchedule['Topic 2'] || todaySchedule['Topic2'] || '',
                topic3: todaySchedule['Topic 3'] || todaySchedule['Topic3'] || '',
                topic4: todaySchedule['Topic 4'] || todaySchedule['Topic4'] || '',
            };
        }

        res.json({ success: true, date: todayStr, schedule });
    } catch (err) {
        console.error('Failed to read schedule:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve schedule: ' + err.message });
    }
});

app.get('/api/schedule/all', verifyToken, (req, res) => {
    try {
        const xlsxPath = join(__dirname, '..', 'Schedule.xlsx');
        const workbook = XLSX.readFile(xlsxPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const list = data.map(row => ({
            date: excelDateToJSDateStr(row.Date),
            day: row.Day,
            topic1: row['Topic 1'] || row['Topic1'] || '',
            topic2: row['Topic 2'] || row['Topic2'] || '',
            topic3: row['Topic 3'] || row['Topic3'] || '',
            topic4: row['Topic 4'] || row['Topic4'] || '',
        }));

        res.json({ success: true, schedule: list });
    } catch (err) {
        console.error('Failed to read all schedule:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve schedule: ' + err.message });
    }
});

// ─── Socket.IO Events ───────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Create Room ──────────────────────────────────────────────────
    socket.on('createRoom', ({ hostName, examType, testFormat, questions, roomMode, enableChat, email }, callback) => {
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
                    playerHistory: (room.roomMode === 'friendly' && room.friendlyHistory && room.friendlyHistory[existingParticipant.name]) ? room.friendlyHistory[existingParticipant.name] : null
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

        const participant = room.participants.find(p => p.id === socket.id);
        const email = participant?.email || null;

        // Prevent duplicate submissions
        const alreadySubmitted = room.results.some(r => r.playerId === socket.id || (email && r.email === email) || r.playerName === playerName);
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
        participants: mapParticipants(room.participants),
        started: room.started,
        examStarted: !!room.examStarted,
    };
}

// ─── Serve Frontend (Production) ─────────────────────────────────────
const frontendPath = join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(join(frontendPath, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🚀 UnMocked server running on http://localhost:${PORT}\n`);
});
