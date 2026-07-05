const fs = require('fs');

const orig = fs.readFileSync('original_setup.jsx', 'utf8').split('\n');
let curr = fs.readFileSync('src/pages/Setup.jsx', 'utf8').split('\n');

function getBlock(lines, searchString) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchString)) {
            start = i;
            break;
        }
    }
    if (start === -1) return null;
    
    let depth = 0;
    let end = start;
    for (let i = start; i < lines.length; i++) {
        depth += (lines[i].match(/\\{/g) || []).length;
        depth -= (lines[i].match(/\\}/g) || []).length;
        if (depth === 0 && i > start) {
            end = i;
            break;
        }
    }
    return { start, end, lines: lines.slice(start, end + 1) };
}

const origBlock = getBlock(orig, 'const generatePrompt = () => {');
const currBlock = getBlock(curr, 'const generatePrompt = () => {');

if (origBlock && currBlock) {
    // Fix the broken newline in origBlock explicitly if it exists
    for (let i = 0; i < origBlock.lines.length; i++) {
        if (origBlock.lines[i].includes('subjectInfo = currentTemplate.subjects.map(s => `${s.name} (${s.count} questions): Topics')) {
            // It might be split across two lines in origBlock as well due to how it was originally saved
            if (origBlock.lines[i].endsWith('.join(\\') || origBlock.lines[i].endsWith(".join('")) {
                // Just replace it entirely
                origBlock.lines[i] = "            subjectInfo = currentTemplate.subjects.map(s => `${s.name} (${s.count} questions): Topics — ${s.topics.join(', ')}`).join('\\\\n');";
                if (origBlock.lines[i+1] && origBlock.lines[i+1].includes("');")) {
                    origBlock.lines[i+1] = ""; // remove the dangling line
                }
            }
            if (origBlock.lines[i].includes(".join('\\n')")) {
                 origBlock.lines[i] = origBlock.lines[i].replace(".join('\\n')", ".join('\\\\n')");
            }
        }
    }
    
    // Filter out empty lines we just nulled
    origBlock.lines = origBlock.lines.filter(l => l !== "");

    curr.splice(currBlock.start, currBlock.end - currBlock.start + 1, ...origBlock.lines);
    fs.writeFileSync('src/pages/Setup.jsx', curr.join('\n'), 'utf8');
    console.log('Restored generatePrompt');
} else {
    console.error('Block not found');
}
