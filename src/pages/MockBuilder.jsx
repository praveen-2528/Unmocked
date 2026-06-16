import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EXAM_TEMPLATES } from '../utils/examTemplates';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChevronLeft, FileJson, CheckCircle, AlertCircle, Save, LayoutTemplate, Trash2 } from 'lucide-react';
import './MockBuilder.css';

const MockBuilder = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();

    const [selectedTemplate, setSelectedTemplate] = useState('ssc_cgl_tier1');
    const [mockName, setMockName] = useState('');
    const [subjectData, setSubjectData] = useState({});
    const [msgs, setMsgs] = useState({}); // { subjectId: { type: 'error|success', text: '' } }
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const template = EXAM_TEMPLATES[selectedTemplate];

    const handlePaste = (subjectId, subjectName, requiredCount, optionsCount, text) => {
        try {
            const parsed = JSON.parse(text);
            const arr = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [parsed];

            if (arr.length !== requiredCount) {
                setMsgs(p => ({ ...p, [subjectId]: { type: 'error', text: `Expected ${requiredCount} questions, found ${arr.length}.` } }));
                return;
            }

            const validQuestions = arr.map((q, i) => {
                const opts = Array.isArray(q.options) ? q.options : Object.values(q.options || {});
                if (opts.length !== optionsCount) throw new Error(`Question ${i + 1} has ${opts.length} options, expected ${optionsCount}.`);

                let correctIdx = q.correct_index !== undefined ? q.correct_index : q.correctAnswer;
                if (correctIdx === undefined && typeof q.correct_option === 'string') {
                    // Try to map 'A', 'B', 'C' to 0, 1, 2
                    correctIdx = q.correct_option.charCodeAt(0) - 65;
                }
                if (correctIdx === undefined || correctIdx < 0 || correctIdx >= optionsCount) {
                    throw new Error(`Question ${i + 1} has invalid correct answer.`);
                }

                return {
                    text: (q.question || q.text || '').toString().split('\\n').join('\n').trim(),
                    options: opts.map(o => (o || '').toString().split('\\n').join('\n').trim()),
                    correctAnswer: correctIdx,
                    explanation: (q.explanation || '').toString().split('\\n').join('\n').trim(),
                    subject: subjectName,
                    subtopic: q.subtopic || '',
                    difficulty: q.difficulty || 'medium'
                };
            });

            setSubjectData(p => ({ ...p, [subjectId]: validQuestions }));
            setMsgs(p => ({ ...p, [subjectId]: { type: 'success', text: `✅ Loaded ${requiredCount} questions.` } }));
        } catch (err) {
            setMsgs(p => ({ ...p, [subjectId]: { type: 'error', text: err.message } }));
        }
    };

    const handleSave = async () => {
        if (!mockName.trim()) return setSaveError('Please enter a name for this Mock Test.');

        const allQuestions = [];
        for (const subj of template.subjects) {
            const data = subjectData[subj.id];
            if (!data || data.length !== subj.count) {
                return setSaveError(`Subject "${subj.name}" is incomplete.`);
            }
            allQuestions.push(...data);
        }

        setSaving(true);
        setSaveError('');

        try {
            const res = await authFetch('/api/mocks', {
                method: 'POST',
                body: JSON.stringify({
                    examTemplateId: template.id,
                    name: mockName,
                    questions: allQuestions
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

            alert(`Success! Mock Test "${mockName}" saved.`);
            navigate('/setup'); // could navigate to Question bank
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const isComplete = template.subjects.every(subj => subjectData[subj.id]?.length === subj.count);
    const currentTotal = Object.values(subjectData).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    const requiredTotal = template.subjects.reduce((sum, subj) => sum + subj.count, 0);

    return (
        <div className="builder-container animate-fade-in">
            <div className="builder-header">
                <h1>🏗️ Mock Test Builder</h1>
                <p>Paste AI-generated JSON subject-by-subject to build a full mock test</p>
            </div>

            <Card className="builder-controls glass">
                <div className="control-row">
                    <div className="control-group">
                        <label>Exam Template</label>
                        <select
                            value={selectedTemplate}
                            onChange={(e) => {
                                setSelectedTemplate(e.target.value);
                                setSubjectData({});
                                setMsgs({});
                            }}
                        >
                            {Object.values(EXAM_TEMPLATES).map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.optionsPerQuestion} options)</option>
                            ))}
                        </select>
                    </div>
                    <div className="control-group">
                        <label>Mock Test Name</label>
                        <input
                            type="text"
                            placeholder="e.g., SSC CGL Full Mock 1"
                            value={mockName}
                            onChange={e => setMockName(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            <div className="subjects-grid">
                {template.subjects.map(subj => {
                    const data = subjectData[subj.id];
                    const msg = msgs[subj.id];
                    const isDone = data?.length === subj.count;

                    return (
                        <Card key={subj.id} className={`subject-panel glass ${isDone ? 'done' : ''}`}>
                            <div className="subject-header">
                                <h3>{subj.name}</h3>
                                <div className="subject-status">
                                    <span className="count-badge">{data?.length || 0} / {subj.count}</span>
                                    {isDone && (
                                        <>
                                            <CheckCircle size={16} className="text-success" />
                                            <button
                                                className="clear-subject-btn"
                                                title="Clear Questions"
                                                onClick={() => {
                                                    setSubjectData(p => { const n = { ...p }; delete n[subj.id]; return n; });
                                                    setMsgs(p => { const n = { ...p }; delete n[subj.id]; return n; });
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {!isDone && (
                                <textarea
                                    className="json-paste-area"
                                    placeholder={`Paste JSON array of ${subj.count} questions here...`}
                                    onChange={(e) => {
                                        if (e.target.value.trim().length > 10)
                                            handlePaste(subj.id, subj.name, subj.count, template.optionsPerQuestion, e.target.value);
                                    }}
                                />
                            )}

                            {msg && (
                                <div className={`subject-msg ${msg.type}`}>
                                    {msg.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                                    {msg.text}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            <Card className="builder-footer glass">
                <div className="footer-stats">
                    <LayoutTemplate size={20} className="text-secondary" />
                    <div className="stats-text">
                        <span className="stats-title">Total Progress</span>
                        <span className="stats-numbers">{currentTotal} / {requiredTotal} questions added</span>
                    </div>
                </div>

                <div className="footer-actions">
                    {saveError && <span className="save-error"><AlertCircle size={14} /> {saveError}</span>}
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!isComplete || !mockName.trim() || saving}
                    >
                        <Save size={16} /> {saving ? 'Saving...' : 'Save Full Mock Test'}
                    </Button>
                </div>
            </Card>

            <div className="builder-back">
                <Button variant="ghost" onClick={() => navigate('/setup')}><ChevronLeft size={16} /> Back to Setup</Button>
            </div>
        </div>
    );
};

export default MockBuilder;
