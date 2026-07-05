const fs = require('fs');

let code = fs.readFileSync('src/pages/Setup.jsx', 'utf8');
let lines = code.split('\n');

const mpBlock = lines.slice(645, 854);     // Lines 646-854
const docsBlock = lines.slice(854, 977);   // Lines 855-977
const practiceBlock = lines.slice(977, 1129); // Lines 978-1129
const studyPlanBlock = lines.slice(1133, 1219); // Lines 1134-1219

const practiceInternalContent = lines.slice(987, 1128).join('\n'); // Inside practice card

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

// Rebuild grid
// Delete the original blocks. Wait, it's safer to just iterate and ignore the old blocks
let newLines = [];
let i = 0;

while (i < lines.length) {
    if (lines[i].includes('className="home-actions-column"')) {
        newLines.push(lines[i]); // Keep the div
        i++;
        newLines.push(...mpBlock); // Multiplayer first
        newLines.push('');
        newLines.push(...shrunkPractice); // Shrunk practice next
        
        // Skip over the original blocks in left column
        while (i < lines.length && !lines[i].includes('className="home-dashboard-column"')) {
            i++;
        }
    } 
    else if (lines[i].includes('className="home-dashboard-column"')) {
        newLines.push(lines[i]); // Keep the div
        i++;
        newLines.push(...chatWidget); // AI chat
        newLines.push('');
        newLines.push(...docsBlock); // Docs next
        newLines.push('');
        
        // Skip over original StudyPlan
        while (i < lines.length && !lines[i].includes('className="home-card graph-card glass"')) {
            i++;
        }
    }
    else if (lines[i].includes('{pdfViewerUrl && (')) {
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
console.log('Successfully applied accurate refactor.');
