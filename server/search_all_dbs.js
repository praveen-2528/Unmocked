import fs from 'fs';
import path from 'path';

const searchDir = 'C:/Users/manus';

function searchFiles(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch (e) {
                continue;
            }
            if (stat.isDirectory()) {
                // Avoid scanning system, build, cache, and massive directories for performance
                if (!file.startsWith('.') && 
                    file !== 'node_modules' && 
                    file !== 'dist' && 
                    file !== 'AppData' && 
                    file !== 'Microsoft' && 
                    file !== '3D Objects' && 
                    file !== 'Contacts' && 
                    file !== 'Searches' && 
                    file !== 'Links' &&
                    file !== 'Saved Games') {
                    searchFiles(fullPath);
                }
            } else if (file.endsWith('.db')) {
                console.log(`Found DB: ${fullPath} (${stat.size} bytes) - Modified: ${stat.mtime}`);
            }
        }
    } catch (e) {
        // ignore errors
    }
}

console.log("Scanning user directory for database files...");
searchFiles(searchDir);
console.log("Scan finished.");
