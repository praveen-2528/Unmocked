import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'testara.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// ─── Create Tables ──────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        exam_type TEXT,
        test_format TEXT,
        score INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        incorrect INTEGER DEFAULT 0,
        unattempted INTEGER DEFAULT 0,
        total_marks REAL DEFAULT 0,
        max_marks REAL DEFAULT 0,
        percentage REAL DEFAULT 0,
        total_time INTEGER DEFAULT 0,
        marking_scheme TEXT,
        topic_breakdown TEXT,
        is_multiplayer INTEGER DEFAULT 0,
        answers_json TEXT,
        time_spent_json TEXT,
        questions_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_user ON test_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_history_date ON test_history(created_at);

    CREATE TABLE IF NOT EXISTS mock_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        exam_template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mock_test_id INTEGER,
        question_text TEXT NOT NULL,
        options TEXT NOT NULL,
        correct_answer INTEGER NOT NULL,
        explanation TEXT DEFAULT '',
        subject TEXT DEFAULT 'General',
        subtopic TEXT DEFAULT '',
        difficulty TEXT DEFAULT 'medium',
        exam_type TEXT DEFAULT 'ssc',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (mock_test_id) REFERENCES mock_tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, friend_id)
    );

    CREATE INDEX IF NOT EXISTS idx_questions_mock ON questions(mock_test_id);

    CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
`);

// ─── Migrations ─────────────────────────────────────────────────────
try {
    db.exec(`ALTER TABLE questions ADD COLUMN mock_test_id INTEGER;`);
    console.log("Migration: Added mock_test_id to questions table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE questions ADD COLUMN topic TEXT DEFAULT '';`);
    console.log("Migration: Added topic to questions table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT 'MCQ';`);
    console.log("Migration: Added question_type to questions table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);`);
} catch (e) { /* indexes already exist */ }

try {
    db.exec(`ALTER TABLE test_history ADD COLUMN answers_json TEXT;`);
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE test_history ADD COLUMN time_spent_json TEXT;`);
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE test_history ADD COLUMN questions_json TEXT;`);
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`);
    console.log("Migration: Added role to users table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE test_history ADD COLUMN test_code TEXT;`);
    console.log("Migration: Added test_code to test_history table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`ALTER TABLE mock_tests ADD COLUMN test_code TEXT;`);
    console.log("Migration: Added test_code to mock_tests table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`UPDATE test_history SET test_code = 'TS-' || (id + 1000) WHERE test_code IS NULL;`);
    console.log("Migration: Backfilled test codes in test_history");
} catch (e) { }

// Gamification Migrations
try {
    db.exec(`ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0;`);
    console.log("Migration: Added xp to users table");
} catch (e) { /* column already exists */ }

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            badge_key TEXT NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            test_history_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (test_history_id) REFERENCES test_history(id) ON DELETE SET NULL,
            UNIQUE(user_id, badge_key)
        );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_badges_user ON user_badges(user_id);`);
    console.log("Migration: Created user_badges table");
} catch (e) { }

// Shared Documents Migrations
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS shared_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            filename TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER NOT NULL,
            file_data TEXT NOT NULL,
            uploaded_by INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_user ON shared_documents(uploaded_by);`);
    console.log("Migration: Created shared_documents table");
} catch (e) {
    console.error("Migration: Failed to create shared_documents table:", e.message);
}

// Seed admin user if not exists
try {
    const adminExists = db.prepare("SELECT 1 FROM users WHERE email = 'admin@testara.com'").get();
    if (!adminExists) {
        const hash = bcrypt.hashSync('adminsecure123', 10);
        db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@testara.com', ?, 'admin')").run(hash);
        console.log("Migration: Seeded default admin user admin@testara.com successfully.");
    }
} catch (e) {
    console.error("Migration: Failed to seed admin user:", e.message);
}

export default db;
