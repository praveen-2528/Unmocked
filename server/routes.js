import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import db from './db.js';
import { rooms, getMembersCount, getSeatingArrangementType } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const JWT_SECRET = process.env.JWT_SECRET || 'unmocked_secret_key_change_in_production';

export const verifyToken = (req, res, next) => {
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

const verifyAdmin = (req, res, next) => {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

export const setupRoutes = (app) => {

    app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', rooms: rooms.size });
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
    const rows = db.prepare('SELECT * FROM test_history WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);

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

// ── History: Get Historical Multiplayer Leaderboard ──────────────────
    app.get('/api/history/room/:code', verifyToken, (req, res) => {
    try {
        const testCode = req.params.code;
        if (!testCode) return res.status(400).json({ error: 'Room code required.' });

        const rows = db.prepare(`
            SELECT th.*, u.name as player_name, u.email as player_email
            FROM test_history th
            LEFT JOIN users u ON th.user_id = u.id
            WHERE th.test_code = ? AND th.is_multiplayer = 1
            ORDER BY th.score DESC, th.total_time ASC
        `).all(testCode);

        if (rows.length === 0) {
            return res.json({ leaderboard: [] });
        }

        const leaderboard = rows.map(r => ({
            playerId: r.user_id, // we'll use user_id as playerId for historical
            playerName: r.player_name || 'Unknown',
            email: r.player_email,
            score: r.score,
            total: r.total,
            correct: r.correct,
            incorrect: r.incorrect,
            marks: r.total_marks,
            maxMarks: r.max_marks,
            totalTime: r.total_time,
            submittedAt: r.created_at,
        }));

        res.json({ leaderboard });
    } catch (err) {
        console.error('Error fetching historical leaderboard:', err);
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
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


};