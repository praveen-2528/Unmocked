const fs = require('fs');
const code = fs.readFileSync('src/pages/Setup.jsx', 'utf8');
const lines = code.split('\n');

const mpCard = lines.slice(646, 853).join('\n');
const docsCard = lines.slice(855, 977).join('\n');
const practiceCard = lines.slice(978, 1128).join('\n');
const studyPlanCard = lines.slice(1134, 1218).join('\n');

const practiceInternalContent = lines.slice(987, 1127).join('\n');

const shrunkPractice = `                    {/* Practice Solo Card (Shrunk) */}
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

const chatWidget = `                    {/* AI Chat Widget replacing Study Goals */}
                    <AIChatWidget height="450px" />`;

const newActionsColumn = mpCard + '\n\n' + shrunkPractice;
const newDashboardColumn = chatWidget + '\n\n' + docsCard;

// Now reconstruct Setup.jsx using EXACT line numbers
let newLines = [
    ...lines.slice(0, 646),
    newActionsColumn,
    ...lines.slice(1128, 1134),
    newDashboardColumn,
    ...lines.slice(1218, 1358)
];

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

newLines.push(modalTemplate);
newLines.push(...lines.slice(1358));

let newCode = newLines.join('\n');

newCode = newCode.replace("const [pdfViewerTitle, setPdfViewerTitle] = useState('');", 
                          "const [pdfViewerTitle, setPdfViewerTitle] = useState('');\n    const [showSoloModal, setShowSoloModal] = useState(false);");

newCode = newCode.replace('import Card from', "import AIChatWidget from '../components/AIChatWidget';\nimport Card from");

fs.writeFileSync('src/pages/Setup.jsx', newCode, 'utf8');
console.log("Successfully rebuilt Setup.jsx using exact indices!");
