import Database from 'better-sqlite3';

try {
    const db = new Database('unmocked.db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Active UnMocked DB Tables:");
    console.log(tables);
    for (const table of tables) {
        try {
            const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
            console.log(`- Table ${table.name}: ${count} rows`);
            if (table.name === 'users') {
                const users = db.prepare("SELECT id, name, email FROM users").all();
                console.log("Users:", users);
            }
        } catch (e) {
            console.log(`- Table ${table.name}: error counting rows (${e.message})`);
        }
    }
} catch (e) {
    console.error("Failed to query active database:", e.message);
}
