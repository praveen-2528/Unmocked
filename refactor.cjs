const fs = require('fs');

let code = fs.readFileSync('src/pages/Setup.jsx', 'utf8');
let lines = code.split('\n');

function getBoundsByClass(className) {
    let start = -1;
    let end = -1;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
        if (start === -1 && lines[i].includes(className)) {
            start = i;
            depth = 1;
        } else if (start !== -1) {
            if (lines[i].includes('<Card')) depth++;
            if (lines[i].includes('</Card>')) {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
    }
    return { start, end, content: lines.slice(start, end + 1) };
}

// Extract components
const docs = getBoundsByClass('className="home-card documents-card glass hover-lift"');
const practice = getBoundsByClass('className="home-card practice-card glass"');
const mp = getBoundsByClass('className="home-card multiplayer-card glass"');
const studyPlan = getBoundsByClass('className="home-card study-goals-card glass"');

if (docs.start === -1 || practice.start === -1 || mp.start === -1 || studyPlan.start === -1) {
    console.error("Could not find all cards");
    process.exit(1);
}

const practiceInternalContent = lines.slice(practice.start + 10, practice.end).join('\n');

const shrunkPractice = [
    `                    <Card className="home-card practice-card glass" style={{ cursor: 'pointer' }} onClick={() => setShowSoloModal(true)}>`,
    `                        <div className="card-header" style={{ marginBottom: '1rem' }}>`,
    `                            <div className="title-icon"><Target size={22} className="text-indigo" /></div>`,
    `                            <div>`,
    `                                <h2>Practice Solo</h2>`,
    `                                <p>Self-paced test preparation wizard</p>`,
    `                            </div>`,
    `                        </div>`,
    `                        <Button variant="primary" style={{ width: '100%' }} onClick={(e) => { e.stopPropagation(); setShowSoloModal(true); }}>`,
    `                            Launch Practice Wizard`,
    `                        </Button>`,
    `                    </Card>`
];

const modalTemplate = [
    `            {showSoloModal && (`,
    `                <div className="pdf-viewer-modal-backdrop" onClick={() => setShowSoloModal(false)}>`,
    `                    <div className="pdf-viewer-modal-content glass" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', overflowY: 'auto', height: '90vh', maxWidth: '1000px', width: '90%' }}>`,
    `                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>`,
    `                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>`,
    `                                <Target size={24} className="text-indigo" />`,
    `                                <h2 style={{ margin: 0 }}>Practice Solo Wizard</h2>`,
    `                            </div>`,
    `                            <button className="pdf-viewer-close-btn" onClick={() => setShowSoloModal(false)}>&times;</button>`,
    `                        </div>`,
    practiceInternalContent,
    `                    </div>`,
    `                </div>`,
    `            )}`
];

const chatWidget = [
    `                    <AIChatWidget height="450px" />`
];

// Add showSoloModal state
let stateAdded = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const [showSummaryModal, setShowSummaryModal] = useState(false);')) {
        lines.splice(i + 1, 0, '    const [showSoloModal, setShowSoloModal] = useState(false);');
        stateAdded = true;
        break;
    }
}

// Add import AIChatWidget
let importAdded = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('import Card from')) {
        lines.splice(i + 1, 0, "import AIChatWidget from '../components/AIChatWidget';");
        importAdded = true;
        break;
    }
}

let newLines = [];
let i = 0;
while (i < lines.length) {
    if (lines[i].includes('className="home-card documents-card glass hover-lift"')) {
        // Swap Docs with MP
        newLines.push(...mp.content);
        let depth = 1; i++;
        while (depth > 0) {
            if (lines[i].includes('<Card')) depth++;
            if (lines[i].includes('</Card>')) depth--;
            i++;
        }
    }
    else if (lines[i].includes('className="home-card practice-card glass"')) {
        // Shrink Practice
        newLines.push(...shrunkPractice);
        let depth = 1; i++;
        while (depth > 0) {
            if (lines[i].includes('<Card')) depth++;
            if (lines[i].includes('</Card>')) depth--;
            i++;
        }
    }
    else if (lines[i].includes('className="home-card multiplayer-card glass"')) {
        // Swap MP with Docs
        newLines.push(...docs.content);
        let depth = 1; i++;
        while (depth > 0) {
            if (lines[i].includes('<Card')) depth++;
            if (lines[i].includes('</Card>')) depth--;
            i++;
        }
    }
    else if (lines[i].includes('className="home-card study-goals-card glass"')) {
        // Replace Study Plan with Chat Widget
        newLines.push(...chatWidget);
        let depth = 1; i++;
        while (depth > 0) {
            if (lines[i].includes('<Card')) depth++;
            if (lines[i].includes('</Card>')) depth--;
            i++;
        }
    }
    else if (lines[i].includes('{pdfViewerUrl && (')) {
        // Insert modal just before PDF viewer
        newLines.push(...modalTemplate);
        newLines.push(lines[i]);
        i++;
    }
    else {
        newLines.push(lines[i]);
        i++;
    }
}

fs.writeFileSync('src/pages/Setup.jsx', newLines.join('\n'), 'utf8');
console.log('Successfully swapped and shrunk UI.');
