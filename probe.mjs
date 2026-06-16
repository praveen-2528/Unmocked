import Database from 'better-sqlite3';
import { join } from 'path';

const db = new Database(join(process.cwd(), 'server', 'testara.db'));
const rows = db.prepare('SELECT id, test_name, test_format, (CASE WHEN questions IS NULL THEN "NULL" ELSE "EXISTS" END) as q_status FROM test_history ORDER BY id DESC LIMIT 5').all();
console.log(JSON.stringify(rows, null, 2));
