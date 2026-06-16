import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChevronLeft, Sparkles, Download, Save, CheckCircle, Copy, ClipboardCheck, Upload, FileSpreadsheet } from 'lucide-react';
import { parseCSVString, questionsToCSV } from '../utils/csvParser';
import QuestionRenderer from '../components/QuestionRenderer';
import { EXAM_TEMPLATES } from '../utils/examTemplates';
import { copyToClipboard } from '../utils/copy';
import './AIGenerator.css';

const AIGenerator = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();

    // Step 1: Configure
    const [subject, setSubject] = useState('');
    const [topic, setTopic] = useState('');
    const [count, setCount] = useState(10);
    const [difficulty, setDifficulty] = useState('medium');
    const [examType, setExamType] = useState('ssc_cgl_tier1');

    // Step 2: Generated prompt
    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [copied, setCopied] = useState(false);

    // Step 3: Paste AI output
    const [aiOutput, setAiOutput] = useState('');
    const [parsedQuestions, setParsedQuestions] = useState([]);
    const [parseErrors, setParseErrors] = useState([]);
    const [saved, setSaved] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const [step, setStep] = useState(1);

    const selectedTemplate = EXAM_TEMPLATES[examType];
    const optionsCount = selectedTemplate?.optionsPerQuestion || 4;
    const optionLetters = Array.from({ length: optionsCount }, (_, i) => String.fromCharCode(65 + i));

    const generatePrompt = () => {
        if (!subject.trim()) return;

        const prompt = `Generate exactly ${count} multiple-choice questions for a competitive exam in CSV format.

REQUIREMENTS:
- Subject: ${subject}
${topic ? `- Topic: ${topic}` : ''}
- Difficulty: ${difficulty}
- Each question must have exactly ${optionsCount} options
- Exam type: ${selectedTemplate?.name || examType}

OUTPUT FORMAT:
Return ONLY a CSV with these exact headers (no extra text, no explanations, no markdown):

question,option_a,option_b,option_c,option_d,${optionsCount >= 5 ? 'option_e,' : ''}correct_option,explanation,subject,topic,subtopic,difficulty,question_type,exam_type

RULES:
- correct_option must be a single letter (${optionLetters.join(', ')})
- difficulty must be: ${difficulty}
- question_type should be: MCQ
- exam_type should be: ${examType}
- Wrap any field containing commas in double quotes
- Generate exam-level questions suitable for ${selectedTemplate?.name || 'competitive exams'}
- Each question should have a clear, concise explanation
- Subject: "${subject}" | Topic: "${topic || subject}"
- For questions containing multiple statements, premises, or conclusions (such as Syllogisms, Assertion-Reason, or passage-based questions), format the question text to put each statement/premise/conclusion on a new line using a newline character (\n) for readability.

START OUTPUT WITH THE CSV HEADER ROW DIRECTLY. NO OTHER TEXT.`;

        setGeneratedPrompt(prompt);
        setStep(2);
    };

    const handleCopy = async () => {
        const success = await copyToClipboard(generatedPrompt);
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleParseOutput = () => {
        if (!aiOutput.trim()) return;

        // Try to clean up the AI output — remove markdown code fences if present
        let cleaned = aiOutput.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:csv)?\n?/, '').replace(/\n?```$/, '');
        }

        const result = parseCSVString(cleaned);
        setParsedQuestions(result.questions);
        setParseErrors(result.errors);

        if (result.questions.length > 0) {
            setStep(4);
        }
    };

    const handleSaveToBank = async () => {
        if (parsedQuestions.length === 0) return;
        try {
            const res = await authFetch('/api/questions/bulk', {
                method: 'POST',
                body: JSON.stringify({ questions: parsedQuestions }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSaved(true);
            setSaveMsg(`✅ Saved ${data.imported} questions to your bank!`);
        } catch (err) {
            setSaveMsg(`❌ ${err.message}`);
        }
    };

    const handleExportCSV = () => {
        if (parsedQuestions.length === 0) return;
        const csv = questionsToCSV(parsedQuestions);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `testara_${subject.replace(/\s+/g, '_')}_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const difficultyOptions = ['easy', 'medium', 'hard'];

    return (
        <div className="ai-container animate-fade-in">
            <div className="ai-header">
                <h1><Sparkles size={32} className="ai-icon" /> AI Question Generator</h1>
                <p>Generate questions using <strong>any free AI</strong> — DeepSeek, ChatGPT, Gemini & more</p>
            </div>

            {/* Step Indicator */}
            <div className="step-indicator">
                <div className={`step-dot ${step >= 1 ? 'active' : ''}`}><span>1</span> Configure</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 2 ? 'active' : ''}`}><span>2</span> Copy Prompt</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 3 ? 'active' : ''}`}><span>3</span> Paste Output</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 4 ? 'active' : ''}`}><span>4</span> Import</div>
            </div>

            {/* STEP 1: Configure */}
            {step >= 1 && (
                <Card className={`ai-config-card glass ${step > 1 ? 'collapsed' : ''}`}>
                    <h3>⚙️ Step 1: Configure Your Questions</h3>

                    <div className="ai-form">
                        <div className="ai-form-group">
                            <label>Subject *</label>
                            <input
                                type="text"
                                placeholder="e.g., General Awareness, English, Quantitative Aptitude"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                        </div>

                        <div className="ai-form-group">
                            <label>Topic (optional)</label>
                            <input
                                type="text"
                                placeholder="e.g., Idioms and Phrases, Indian History, Profit & Loss"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                            />
                        </div>

                        <div className="ai-form-row">
                            <div className="ai-form-group">
                                <label>Number of Questions</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={count}
                                    onChange={e => setCount(parseInt(e.target.value) || 10)}
                                />
                            </div>

                            <div className="ai-form-group">
                                <label>Difficulty</label>
                                <div className="difficulty-pills">
                                    {difficultyOptions.map(d => (
                                        <button
                                            key={d}
                                            className={`diff-pill ${difficulty === d ? 'active' : ''} diff-${d}`}
                                            onClick={() => setDifficulty(d)}
                                        >
                                            {d.charAt(0).toUpperCase() + d.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="ai-form-group">
                                <label>Exam Type</label>
                                <select value={examType} onChange={e => setExamType(e.target.value)}>
                                    {Object.values(EXAM_TEMPLATES).map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {step === 1 && (
                            <Button
                                variant="primary"
                                onClick={generatePrompt}
                                disabled={!subject.trim()}
                                className="generate-btn"
                            >
                                <Sparkles size={18} /> Generate Prompt
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {/* STEP 2: Copy Prompt */}
            {step >= 2 && (
                <Card className={`ai-prompt-card glass animate-fade-in ${step > 2 ? 'collapsed' : ''}`}>
                    <h3>📋 Step 2: Copy This Prompt</h3>
                    <p className="step-desc">Paste this into <a href="https://chat.deepseek.com" target="_blank" rel="noreferrer">DeepSeek</a>, <a href="https://chat.openai.com" target="_blank" rel="noreferrer">ChatGPT</a>, <a href="https://gemini.google.com" target="_blank" rel="noreferrer">Gemini</a>, or any free AI:</p>

                    <div className="prompt-box">
                        <pre>{generatedPrompt}</pre>
                    </div>

                    <div className="prompt-actions">
                        <Button variant="primary" onClick={handleCopy}>
                            {copied ? <><ClipboardCheck size={16} /> Copied!</> : <><Copy size={16} /> Copy Prompt</>}
                        </Button>
                        <Button variant="outline" onClick={() => setStep(3)}>
                            Next: Paste AI Output →
                        </Button>
                    </div>
                </Card>
            )}

            {/* STEP 3: Paste AI Output */}
            {step >= 3 && step < 4 && (
                <Card className="ai-output-card glass animate-fade-in">
                    <h3>📥 Step 3: Paste the AI&apos;s CSV Output</h3>
                    <p className="step-desc">Copy the entire CSV output from the AI and paste it below:</p>

                    <textarea
                        className="output-textarea"
                        rows={10}
                        placeholder="Paste the CSV output from the AI here...&#10;&#10;question,option_a,option_b,option_c,option_d,correct_option,explanation,subject,topic,subtopic,difficulty,question_type,exam_type&#10;What is...,Option A,Option B,Option C,Option D,B,Because...,General Awareness,Geography,Capitals,easy,MCQ,ssc_cgl_tier1"
                        value={aiOutput}
                        onChange={e => setAiOutput(e.target.value)}
                    />

                    {parseErrors.length > 0 && (
                        <div className="parse-errors">
                            ⚠️ {parseErrors.length} issue(s): {parseErrors.slice(0, 3).join('; ')}
                        </div>
                    )}

                    <div className="prompt-actions">
                        <Button variant="primary" onClick={handleParseOutput} disabled={!aiOutput.trim()}>
                            <FileSpreadsheet size={16} /> Parse & Preview
                        </Button>
                        <Button variant="ghost" onClick={() => setStep(2)}>
                            ← Back
                        </Button>
                    </div>
                </Card>
            )}

            {/* STEP 4: Preview & Import */}
            {step === 4 && parsedQuestions.length > 0 && (
                <div className="ai-results animate-fade-in">
                    <div className="ai-results-header">
                        <h3>🎉 Parsed {parsedQuestions.length} Questions</h3>
                        <div className="ai-results-actions">
                            <Button
                                variant="primary"
                                onClick={handleSaveToBank}
                                disabled={saved}
                            >
                                {saved ? <><CheckCircle size={16} /> Saved!</> : <><Save size={16} /> Save to Bank</>}
                            </Button>
                            <Button variant="outline" onClick={handleExportCSV}>
                                <Download size={16} /> Export CSV
                            </Button>
                        </div>
                    </div>
                    {saveMsg && <div className="ai-save-msg">{saveMsg}</div>}

                    <div className="ai-questions-list">
                        {parsedQuestions.map((q, i) => (
                            <Card key={i} className="ai-q-card glass">
                                <div className="ai-q-header">
                                    <span className="ai-q-num">Q{i + 1}</span>
                                    <div className="ai-q-tags">
                                        {q.subject && <span className="ai-tag subject">{q.subject}</span>}
                                        {q.topic && <span className="ai-tag topic">{q.topic}</span>}
                                        {q.difficulty && <span className={`ai-tag diff-${q.difficulty}`}>{q.difficulty}</span>}
                                        {q.questionType && <span className="ai-tag type">{q.questionType}</span>}
                                    </div>
                                </div>
                                <div className="ai-q-text">
                                    <QuestionRenderer text={q.text} subject={q.subject} />
                                </div>
                                <div className="ai-q-options">
                                    {q.options.map((opt, oi) => (
                                        <div key={oi} className={`ai-q-opt ${oi === q.correctAnswer ? 'correct' : ''}`}>
                                            <span className="opt-letter">{String.fromCharCode(65 + oi)}</span>
                                            {opt}
                                            {oi === q.correctAnswer && <CheckCircle size={14} className="correct-icon" />}
                                        </div>
                                    ))}
                                </div>
                                {q.explanation && (
                                    <div className="ai-q-explanation">
                                        <strong>Explanation:</strong> {q.explanation}
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>

                    <div className="prompt-actions" style={{ marginTop: '1rem' }}>
                        <Button variant="ghost" onClick={() => { setStep(3); setParsedQuestions([]); setParseErrors([]); setSaved(false); setSaveMsg(''); }}>
                            ← Back to Paste
                        </Button>
                        <Button variant="ghost" onClick={() => { setStep(1); setGeneratedPrompt(''); setAiOutput(''); setParsedQuestions([]); setParseErrors([]); setSaved(false); setSaveMsg(''); }}>
                            Start Over
                        </Button>
                    </div>
                </div>
            )}

            <div className="ai-back">
                <Button variant="ghost" onClick={() => navigate('/')}>
                    <ChevronLeft size={16} /> Back to Home
                </Button>
            </div>
        </div>
    );
};

export default AIGenerator;
