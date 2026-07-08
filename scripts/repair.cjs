const fs = require('fs');
let code = fs.readFileSync('src/pages/Setup.jsx', 'utf8');

const targetStr = 'const generatePrompt = () => {';
const start = code.indexOf(targetStr);
if (start === -1) {
    console.error('Function not found!');
    process.exit(1);
}

let end = start;
let open = 0;
let started = false;
for (let i = start; i < code.length; i++) {
    if (code[i] === '{') {
        open++;
        started = true;
    } else if (code[i] === '}') {
        open--;
    }
    if (started && open === 0) {
        end = i;
        break;
    }
}

const originalFunction = code.substring(start, end + 1);

const correctFunction = `const generatePrompt = () => {
        if (!currentTemplate) return;

        const optionsCount = currentTemplate.optionsPerQuestion;
        const optionLetters = Array.from({ length: optionsCount }, (_, i) => String.fromCharCode(65 + i));
        const optionHeaders = optionLetters.map(l => \`option_\${l.toLowerCase()}\`).join(',');

        let subjectInfo, topicInfo, questionCount;

        if (testFormat === 'full') {
            subjectInfo = currentTemplate.subjects.map(s => \`\${s.name} (\${s.count} questions): Topics — \${s.topics.join(', ')}\`).join('\\n');
            questionCount = currentTemplate.subjects.reduce((sum, s) => sum + s.count, 0);
            topicInfo = '';
        } else if (testFormat === 'subject') {
            const subj = currentSubject;
            if (!subj) return setError('Select a subject.');
            subjectInfo = \`\${subj.name} (\${subj.count} questions)\`;
            topicInfo = \`Topics to cover: \${subj.topics.join(', ')}\`;
            questionCount = subj.count;
        } else if (testFormat === 'topic') {
            const subj = currentSubject;
            if (!subj || !selectedTopic) return setError('Select subject and topic.');
            subjectInfo = subj.name;
            topicInfo = \`Topic: \${selectedTopic}\`;
            questionCount = topicQuestionCount;
        }

        const prompt = \`Generate exactly \${questionCount} multiple-choice questions for \${currentTemplate.name} exam in CSV format.

REQUIREMENTS:
- Exam: \${currentTemplate.name}
\${testFormat === 'full' ? \`- Full Mock Test covering all subjects:
\${subjectInfo}\` : \`- Subject: \${subjectInfo}
\${topicInfo ? \`- \${topicInfo}\` : ''}\`}
- Difficulty: Mix of easy, medium, and hard
- Each question must have exactly \${optionsCount} options (\${optionLetters.join(', ')})

OUTPUT FORMAT:
Return ONLY a CSV with these exact headers (no extra text, no explanations, no markdown):

question,\${optionHeaders},correct_option,explanation,subject,topic,subtopic,difficulty,question_type,exam_type

RULES:
- correct_option must be a single letter (\${optionLetters.join(', ')})
- question_type should be: MCQ
- exam_type should be: \${examType}
- Wrap any field containing commas in double quotes
- Generate real exam-level questions suitable for \${currentTemplate.name}
- Each question should have a clear, concise explanation
- Use proper subject/topic/subtopic tags matching the exam syllabus

START OUTPUT WITH THE CSV HEADER ROW DIRECTLY. NO OTHER TEXT.\`;

        setGeneratedPrompt(prompt);
    }`;

code = code.substring(0, start) + correctFunction + code.substring(end + 1);
fs.writeFileSync('src/pages/Setup.jsx', code, 'utf8');
console.log('Successfully repaired generatePrompt!');
