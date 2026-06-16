import Database from 'better-sqlite3';
import { join } from 'path';

const db = new Database(join(process.cwd(), 'testara.db'));
try {
  db.exec("ALTER TABLE test_history ADD COLUMN test_name TEXT DEFAULT 'Untitled Test'");
  console.log("Added test_name");
} catch (e) {
  console.log("Error test_name:", e.message);
}
try {
  db.exec("ALTER TABLE test_history ADD COLUMN questions TEXT");
  console.log("Added questions");
} catch (e) {
  console.log("Error questions:", e.message);
}
