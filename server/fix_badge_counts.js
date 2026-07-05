import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'unmocked.db');
const db = new Database(dbPath);

console.log("Starting accurate badge count recalculation...");

const derivableBadges = [
    'accuracy_50', 'accuracy_75', 'accuracy_100',
    'master_reasoning', 'master_quant', 'master_english', 'master_gs',
    'marathoner', 'flawless_victory',
    'streak_10', 'roast_streak_wrong',
    'roast_0_percent', 'roast_slowpoke', 'roast_blind_guesser'
];

const users = db.prepare('SELECT id FROM users').all();

for (const user of users) {
    const userId = user.id;
    const histories = db.prepare('SELECT * FROM test_history WHERE user_id = ? ORDER BY id ASC').all(userId);
    
    let expectedCounts = {};
    for (const badge of derivableBadges) {
        expectedCounts[badge] = 0;
    }

    for (const history of histories) {
        const total = history.total || 0;
        const correct = history.correct || 0;
        const percentage = history.percentage || 0;
        const totalTime = history.total_time || 0;
        
        let questions = [];
        let answers = {};
        try {
            if (history.questions_json) questions = JSON.parse(history.questions_json);
            if (history.answers_json) answers = JSON.parse(history.answers_json);
        } catch(e) {}

        const unlockedThisTest = new Set();

        if (total >= 5) {
            const accuracy = ((correct) / total) * 100;
            if (accuracy >= 50) unlockedThisTest.add('accuracy_50');
            if (accuracy >= 75) unlockedThisTest.add('accuracy_75');
            if (accuracy === 100) unlockedThisTest.add('accuracy_100');

            if (correct === total && questions && questions.length > 0) {
                const firstQ = questions[0];
                let testSubject = '';
                if (firstQ && firstQ.subject) {
                    testSubject = firstQ.subject.toLowerCase();
                }
                if (testSubject.includes('reason') || testSubject.includes('intel')) unlockedThisTest.add('master_reasoning');
                else if (testSubject.includes('quant') || testSubject.includes('math') || testSubject.includes('arith')) unlockedThisTest.add('master_quant');
                else if (testSubject.includes('eng')) unlockedThisTest.add('master_english');
                else if (testSubject.includes('general') || testSubject.includes('gs') || testSubject.includes('aware') || testSubject.includes('studi')) unlockedThisTest.add('master_gs');
            }
        }

        if (totalTime >= 1800) unlockedThisTest.add('marathoner');
        if (total > 20 && percentage === 100) unlockedThisTest.add('flawless_victory');

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
                        currentCorrectStreak++; maxCorrectStreak = Math.max(maxCorrectStreak, currentCorrectStreak);
                        currentWrongStreak = 0;
                    } else {
                        currentWrongStreak++; maxWrongStreak = Math.max(maxWrongStreak, currentWrongStreak);
                        currentCorrectStreak = 0;
                    }
                } else {
                    currentCorrectStreak = 0; currentWrongStreak = 0;
                }
            }
            if (maxCorrectStreak >= 10) unlockedThisTest.add('streak_10');
            if (maxWrongStreak >= 5) unlockedThisTest.add('roast_streak_wrong');
        }

        if (total > 0 && percentage === 0) unlockedThisTest.add('roast_0_percent');
        if (totalTime > 900 && total <= 10) unlockedThisTest.add('roast_slowpoke');
        if (percentage <= 20 && totalTime < 60 && total >= 10) unlockedThisTest.add('roast_blind_guesser');

        // Add to expected counts
        for (const badge of unlockedThisTest) {
            expectedCounts[badge]++;
        }
    }

    // Now update database to strictly match expected counts
    for (const badge of derivableBadges) {
        const count = expectedCounts[badge];
        if (count > 0) {
            db.prepare('INSERT INTO user_badges (user_id, badge_key, earned_count) VALUES (?, ?, ?) ON CONFLICT(user_id, badge_key) DO UPDATE SET earned_count = excluded.earned_count').run(userId, badge, count);
        } else {
            db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_key = ?').run(userId, badge);
        }
    }

    // Dedicated learner fix
    if (histories.length >= 10) {
        db.prepare('INSERT INTO user_badges (user_id, badge_key, earned_count) VALUES (?, ?, 1) ON CONFLICT(user_id, badge_key) DO UPDATE SET earned_count = 1').run(userId, 'dedicated_learner');
    } else {
        db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_key = ?').run(userId, 'dedicated_learner');
    }
}

console.log(`Recalculation complete! All derivable badge counts are now exact.`);
