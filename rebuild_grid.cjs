const fs = require('fs');

let code = fs.readFileSync('src/pages/Setup.jsx', 'utf8');

const actionsColStart = code.indexOf('<div className="home-actions-column">');
const rightColStart = code.indexOf('<div className="home-dashboard-column">');
const perfCardStart = code.indexOf('{/* Performance Graphs Card */}');

if (actionsColStart === -1 || rightColStart === -1 || perfCardStart === -1) {
    console.error("Could not find layout bounds");
    process.exit(1);
}

// Manually extract exactly the 4 cards from the source code based on their known boundaries
function extractCard(startStr, endStr, fromIndex, toIndex) {
    const s = code.indexOf(startStr, fromIndex);
    if (s === -1 || s > toIndex) return '';
    const e = code.indexOf(endStr, s);
    if (e === -1 || e > toIndex) return '';
    return code.substring(s, e + endStr.length);
}

const mpCard = extractCard('{/* Multiplayer Arena Card */}', '</Card>', actionsColStart, rightColStart);
const docsCard = extractCard('{/* Shared Documents & Notes Portal Card */}', '</Card>', actionsColStart, rightColStart);
const practiceCard = extractCard('{/* Practice Solo Card */}', '</Card>', actionsColStart, rightColStart);
const studyPlanCard = extractCard("{/* Today's Study Goals Card */}", '</Card>', rightColStart, perfCardStart);

if (!mpCard || !docsCard || !practiceCard || !studyPlanCard) {
    console.error("Could not extract all 4 cards exactly.");
    process.exit(1);
}

// Build shrunk practice card
const practiceInternalContentMatch = practiceCard.match(/<div className="solo-practice-wizard">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/Card>)/);
let practiceInternalContent = '';
if (practiceInternalContentMatch) {
    practiceInternalContent = practiceInternalContentMatch[0] + '</div>\\n                        </div>';
} else {
    // fallback extraction
    const startIdx = practiceCard.indexOf('<div className="solo-practice-wizard">');
    const endIdx = practiceCard.lastIndexOf('</Card>');
    practiceInternalContent = practiceCard.substring(startIdx, endIdx);
}

const shrunkPractice = `
                    {/* Practice Solo Card (Shrunk) */}
                    <Card className="home-card practice-card glass" style={{ cursor: 'pointer' }} onClick={() => setShowSoloModal(true)}>
                        <div className="card-header" style={{ marginBottom: '1rem' }}>
                            <div className="title-icon"><Target size={22} className="text-indigo" /></div>
                            <div>
                                <h2>Practice Solo</h2>
                                <p>Self-paced test preparation wizard</p>
                            </div>
                        </div>
                        <Button variant="primary" style={{ width: '100%' }} onClick={(e) => { e.stopPropagation(); setShowSoloModal(true); }}>
                            Launch Practice Wizard
                        </Button>
                    </Card>`;

const chatWidget = `
                    {/* AI Chat Widget replacing Study Goals */}
                    <AIChatWidget height="450px" />`;

const newActionsColumn = `<div className="home-actions-column">
${docsCard}
${shrunkPractice}
                </div>`;

const newDashboardColumn = `<div className="home-dashboard-column">
${chatWidget}
${mpCard}
`;

// Now perform the exact replacements in the original code
let newCode = code.substring(0, actionsColStart) + 
              newActionsColumn + 
              "\\n\\n                " + 
              newDashboardColumn + 
              code.substring(perfCardStart);

// Insert modal and states
const modalTemplate = `
            {showSoloModal && (
                <div className="pdf-viewer-modal-backdrop" onClick={() => setShowSoloModal(false)}>
                    <div className="pdf-viewer-modal-content glass" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', overflowY: 'auto', height: '90vh', maxWidth: '1000px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Target size={24} className="text-indigo" />
                                <h2 style={{ margin: 0 }}>Practice Solo Wizard</h2>
                            </div>
                            <button className="pdf-viewer-close-btn" onClick={() => setShowSoloModal(false)}>&times;</button>
                        </div>
                        ${practiceInternalContent}
                    </div>
                </div>
            )}
`;
newCode = newCode.replace('{pdfViewerUrl && (', modalTemplate + '\\n            {pdfViewerUrl && (');

newCode = newCode.replace('const [showSummaryModal, setShowSummaryModal] = useState(false);', 
                          'const [showSummaryModal, setShowSummaryModal] = useState(false);\\n    const [showSoloModal, setShowSoloModal] = useState(false);');

newCode = newCode.replace('import Card from', "import AIChatWidget from '../components/AIChatWidget';\\nimport Card from");

fs.writeFileSync('src/pages/Setup.jsx', newCode, 'utf8');
console.log("Successfully rebuilt Setup.jsx!");
