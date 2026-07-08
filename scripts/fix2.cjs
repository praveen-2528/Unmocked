const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

const replacements = [
    [
        "SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as friend_id",
        "SELECT CASE WHEN user_id1 = ? THEN user_id2 ELSE user_id1 END as friend_id"
    ],
    [
        "WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'",
        "WHERE (user_id1 = ? OR user_id2 = ?) AND status = 'accepted'"
    ],
    [
        "SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
        "SELECT id, status FROM friends WHERE (user_id1 = ? AND user_id2 = ?) OR (user_id1 = ? AND user_id2 = ?)"
    ],
    [
        "INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)",
        "INSERT INTO friends (user_id1, user_id2, status) VALUES (?, ?, ?)"
    ],
    [
        "SELECT * FROM friends WHERE id = ? AND friend_id = ? AND status = ?",
        "SELECT * FROM friends WHERE id = ? AND user_id2 = ? AND status = ?"
    ],
    [
        "DELETE FROM friends WHERE id = ? AND (user_id = ? OR friend_id = ?)",
        "DELETE FROM friends WHERE id = ? AND (user_id1 = ? OR user_id2 = ?)"
    ],
    [
        "SELECT id FROM friends WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = ?",
        "SELECT id FROM friends WHERE ((user_id1 = ? AND user_id2 = ?) OR (user_id1 = ? AND user_id2 = ?)) AND status = ?"
    ]
];

for (const [oldStr, newStr] of replacements) {
    if (!content.includes(oldStr)) {
        console.error("Could not find string:", oldStr);
    }
    content = content.replace(oldStr, newStr);
}

content = content.replaceAll('f.user_id', 'f.user_id1');
content = content.replaceAll('f.friend_id', 'f.user_id2');

fs.writeFileSync('server/index.js', content, 'utf8');
console.log("Replacements complete.");
