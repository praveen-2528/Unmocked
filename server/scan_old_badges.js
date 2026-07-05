import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'unmocked.db');
const db = new Database(dbPath);

console.log("Starting retroactive badge scan...");

// Fetch all test histories
const histories = db.prepare('SELECT * FROM test_history').all();

let totalBadgesAwarded = 0;

for (const history of histories) {
    const userId = history.user_id;
    const historyId = history.id;
    const total = history.total || 0;
    const correct = history.correct || 0;
    const percentage = history.percentage || 0;
    const totalTime = history.total_time || 0;
    
    let questions = [];
    let answers = {};
    
    try {
        if (history.questions_json) questions = JSON.parse(history.questions_json);
        if (history.answers_json) answers = JSON.parse(history.answers_json);
    } catch(e) {
        // Ignored
    }

    const unlockedBadges = [];

    // Core accuracy/mastery badges
    if (total >= 5) {
        const accuracy = ((correct) / total) * 100;
        if (accuracy >= 50) unlockedBadges.push('accuracy_50');
        if (accuracy >= 75) unlockedBadges.push('accuracy_75');
        if (accuracy === 100) unlockedBadges.push('accuracy_100');

        if (correct === total && questions && questions.length > 0) {
            const firstQ = questions[0];
            let testSubject = '';
            if (firstQ && firstQ.subject) {
                testSubject = firstQ.subject.toLowerCase();
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

    // Time/Duration badges
    const createdDate = new Date(history.created_at);
    const currentHour = createdDate.getHours();
    if (currentHour >= 0 && currentHour < 4) unlockedBadges.push('night_owl');
    if (currentHour >= 5 && currentHour < 8) unlockedBadges.push('early_bird');

    if (totalTime >= 1800) unlockedBadges.push('marathoner');
    if (total > 20 && percentage === 100) unlockedBadges.push('flawless_victory');

    // Streaks evaluation
    if (questions && Array.isArray(questions) && answers && typeof answers === 'object') {
        let currentCorrectStreak = 0, maxCorrectStreak = 0;
        let currentWrongStreak = 0, maxWrongStreak = 0;
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const userAns = answers[i];
            if (userAns !== undefined && userAns !== null) {
                const isCorrect = Array.isArray(userAns) 
                    ? JSON.stringify(userAns) === JSON.stringify(q.options[q.correctAnswer || q.correct_answer] || [])
                    : parseInt(userAns) === parseInt(q.correctAnswer !== undefined ? q.correctAnswer : q.correct_answer);
                
                if (isCorrect) {
                    currentCorrectStreak++;
                    maxCorrectStreak = Math.max(maxCorrectStreak, currentCorrectStreak);
                    currentWrongStreak = 0;
                } else {
                    currentWrongStreak++;
                    maxWrongStreak = Math.max(maxWrongStreak, currentWrongStreak);
                    currentCorrectStreak = 0;
                }
            } else {
                currentCorrectStreak = 0;
                currentWrongStreak = 0;
            }
        }
        if (maxCorrectStreak >= 10) unlockedBadges.push('streak_10');
        if (maxWrongStreak >= 5) unlockedBadges.push('roast_streak_wrong');
    }

    // Roast badges
    if (total > 0 && percentage === 0) unlockedBadges.push('roast_0_percent');
    if (totalTime > 900 && total <= 10) unlockedBadges.push('roast_slowpoke');
    if (percentage <= 20 && totalTime < 60 && total >= 10) unlockedBadges.push('roast_blind_guesser');

    // Insert badges
    if (unlockedBadges.length > 0) {
        const badgeStmt = db.prepare('INSERT INTO user_badges (user_id, badge_key, test_history_id) VALUES (?, ?, ?) ON CONFLICT(user_id, badge_key) DO UPDATE SET earned_count = earned_count + 1, test_history_id = excluded.test_history_id');
        for (const badge of unlockedBadges) {
            try {
                badgeStmt.run(userId, badge, historyId);
                totalBadgesAwarded++;
            } catch (e) {
                console.error(`Error inserting badge ${badge} for user ${userId}:`, e.message);
            }
        }
    }
}

// Dedicated Learner badge (>= 10 tests completed)
const users = db.prepare('SELECT id FROM users').all();
for (const user of users) {
    const testCount = db.prepare('SELECT COUNT(*) AS count FROM test_history WHERE user_id = ?').get(user.id).count;
    if (testCount >= 10) {
        try {
            db.prepare('INSERT INTO user_badges (user_id, badge_key, test_history_id) VALUES (?, ?, ?) ON CONFLICT(user_id, badge_key) DO NOTHING').run(user.id, 'dedicated_learner', null);
            totalBadgesAwarded++;
        } catch (e) {}
    }
}

console.log(`Scan complete! Processed badges for ${histories.length} test histories.`);
