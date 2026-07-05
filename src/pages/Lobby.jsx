import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { useExam } from '../context/ExamContext';
import { useAuth } from '../context/AuthContext';
import { EXAM_TEMPLATES } from '../utils/examTemplates';
import { parseCSVString } from '../utils/csvParser';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Users, Plus, LogIn, Copy, Check, Wifi, WifiOff, Crown, User, Zap, BookOpen, ChevronLeft, Globe, Link2, Loader, Unplug, FileSpreadsheet, Sparkles, ClipboardCheck, LayoutTemplate, ChevronRight, Layers, Target, Library, Share2, Monitor } from 'lucide-react';
import FriendlyChat from '../components/FriendlyChat';
import UserProfileModal from '../components/UserProfileModal';
import { copyToClipboard } from '../utils/copy';
import './Lobby.css';

const Lobby = () => {
    const navigate = useNavigate();
    const room = useRoom();
    const { updateExamState } = useExam();
    const { user, authFetch } = useAuth();

    const [tab, setTab] = useState('create');
    const [searchParams] = useSearchParams();

    // Auto-switch to Join tab if ?room= is in the URL
    useEffect(() => {
        const roomParam = searchParams.get('room');
        if (roomParam) {
            setTab('join');
            setJoinCode(roomParam.toUpperCase());
        }
    }, [searchParams]);

    // ── Create Room Wizard State ─────────────────────────────────────
    const [createStep, setCreateStep] = useState(1);
    // Step 1: Exam Type
    const [selectedExam, setSelectedExam] = useState('');
    // Step 2: Test Format
    const [testFormat, setTestFormat] = useState(''); // 'full', 'subject', 'topic'
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [topicQuestionCount, setTopicQuestionCount] = useState(15);
    // Step 3: Load Questions (unified)
    const [questionSource, setQuestionSource] = useState('ai'); // 'ai', 'json', 'bank', 'mock'
    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [promptCopied, setPromptCopied] = useState(false);
    const [aiOutput, setAiOutput] = useState('');
    const [parsedQuestions, setParsedQuestions] = useState([]);
    const [parseErrors, setParseErrors] = useState([]);
    // Question Bank generation
    const [bankSubject, setBankSubject] = useState('all');
    const [bankCount, setBankCount] = useState(25);
    const [bankSubjects, setBankSubjects] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);
    // Step 4: Room Config
    const [hostName, setHostName] = useState(user?.name || '');
    const [roomMode, setRoomMode] = useState('friendly');
    const [enableChat, setEnableChat] = useState(true);
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    // Saved mocks
    const [savedMocks, setSavedMocks] = useState([]);
    const [selectedMockId, setSelectedMockId] = useState('');
    const [mockLoading, setMockLoading] = useState(false);

    // ── Join Room State ──────────────────────────────────────────────
    const [playerName, setPlayerName] = useState(user?.name || '');
    const [joinCode, setJoinCode] = useState('');
    const [joinLink, setJoinLink] = useState('');

    // ── Shared State ─────────────────────────────────────────────────
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [copiedInvite, setCopiedInvite] = useState(false);
    const [copiedShareMsg, setCopiedShareMsg] = useState(false);
    const [copiedLanLink, setCopiedLanLink] = useState(false);
    const [loading, setLoading] = useState(false);
    const [lanAddresses, setLanAddresses] = useState([]);

    // Fetch LAN IP addresses
    useEffect(() => {
        fetch('/api/network-info')
            .then(r => r.json())
            .then(data => setLanAddresses(data.addresses || []))
            .catch(() => { });
    }, []);

    // Fetch saved mocks
    useEffect(() => {
        if (user) {
            authFetch('/api/mocks')
                .then(r => r.json())
                .then(data => setSavedMocks(data.mocks || []))
                .catch(() => { });
        }
    }, [user, authFetch]);

    // Fetch bank subjects when user/exam changes
    useEffect(() => {
        if (user && selectedExam) {
            authFetch(`/api/questions?limit=1&exam_type=${selectedExam}`)
                .then(r => r.json())
                .then(data => setBankSubjects(data.subjects || []))
                .catch(() => { });
        }
    }, [user, selectedExam, authFetch]);

    const currentTemplate = selectedExam ? EXAM_TEMPLATES[selectedExam] : null;
    const currentSubject = currentTemplate?.subjects.find(s => s.id === selectedSubject);

    // ── Step 1: Select Exam ──────────────────────────────────────────
    const handleExamSelect = (examId) => {
        setSelectedExam(examId);
        setTestFormat('');
        setSelectedSubject('');
        setSelectedTopic('');
        setParsedQuestions([]);
        setError('');
        setCreateStep(2);
    };

    // ── Step 2: Select Format ────────────────────────────────────────
    const handleFormatSelect = (fmt) => {
        setTestFormat(fmt);
        setSelectedSubject('');
        setSelectedTopic('');
        setError('');
    };

    // ── Step 3: Generate AI Prompt ───────────────────────────────────
    const generatePrompt = () => {
        if (!currentTemplate) return;

        const optionsCount = currentTemplate.optionsPerQuestion;
        const optionLetters = Array.from({ length: optionsCount }, (_, i) => String.fromCharCode(65 + i));
        const optionHeaders = optionLetters.map(l => `option_${l.toLowerCase()}`).join(',');

        let subjectInfo, topicInfo, questionCount;

        if (testFormat === 'full') {
            // Full mock — generate for all subjects
            subjectInfo = currentTemplate.subjects.map(s => `${s.name} (${s.count} questions): Topics — ${s.topics.join(', ')}`).join('\n');
            questionCount = currentTemplate.subjects.reduce((sum, s) => sum + s.count, 0);
            topicInfo = '';
        } else if (testFormat === 'subject') {
            const subj = currentSubject;
            if (!subj) return setError('Select a subject.');
            subjectInfo = `${subj.name} (${subj.count} questions)`;
            topicInfo = `Topics to cover: ${subj.topics.join(', ')}`;
            questionCount = subj.count;
        } else if (testFormat === 'topic') {
            const subj = currentSubject;
            if (!subj || !selectedTopic) return setError('Select subject and topic.');
            subjectInfo = subj.name;
            topicInfo = `Topic: ${selectedTopic}`;
            questionCount = topicQuestionCount;
        }

        const prompt = `Generate exactly ${questionCount} multiple-choice questions for ${currentTemplate.name} exam in CSV format.

REQUIREMENTS:
- Exam: ${currentTemplate.name}
${testFormat === 'full' ? `- Full Mock Test covering all subjects:\n${subjectInfo}` : `- Subject: ${subjectInfo}\n${topicInfo ? `- ${topicInfo}` : ''}`}
- Difficulty: Mix of easy, medium, and hard
- Each question must have exactly ${optionsCount} options (${optionLetters.join(', ')})

OUTPUT FORMAT:
Return ONLY a CSV with these exact headers (no extra text, no explanations, no markdown):

question,${optionHeaders},correct_option,explanation,subject,topic,subtopic,difficulty,question_type,exam_type

RULES:
- correct_option must be a single letter (${optionLetters.join(', ')})
- question_type should be: MCQ
- exam_type should be: ${selectedExam}
- Wrap any field containing commas or newlines in double quotes
- Generate real exam-level questions suitable for ${currentTemplate.name}
- Each question should have a clear, concise explanation
- Use proper subject/topic/subtopic tags matching the exam syllabus
- Use Markdown formatting to make questions highly visible (e.g., **bolding** keywords, using bullet points, or 'code blocks' for readability). VERY IMPORTANT: If you use commas, newlines, or double quotes within any column text (like markdown code blocks or lists), you MUST wrap the entire column text in double quotes and escape internal double quotes by doubling them ("").
- For math equations, fractions, exponents, or algebraic expressions, use LaTeX formatting wrapped in single $ for inline math (e.g. $x^3 + y^3$) or double $$ for block math.

START OUTPUT WITH THE CSV HEADER ROW DIRECTLY. NO OTHER TEXT.`;

        setGeneratedPrompt(prompt);
    };

    // Load from saved mock
    const loadFromMock = async () => {
        if (!selectedMockId) return setError('Select a saved mock test.');
        setError('');
        setMockLoading(true);
        try {
            const res = await authFetch(`/api/mocks/${selectedMockId}/start`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setParsedQuestions(data.questions);
            setCreateStep(4);
        } catch (err) {
            setError(err.message);
        }
        setMockLoading(false);
    };

    // ── Step 4: Parse AI Output ──────────────────────────────────────
    const handleParseOutput = () => {
        if (!aiOutput.trim()) return;
        setError('');
        let cleaned = aiOutput.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:csv)?\n?/, '').replace(/\n?```$/, '');
        }

        const result = parseCSVString(cleaned);
        if (result.questions.length > 0) {
            for (let i = result.questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result.questions[i], result.questions[j]] = [result.questions[j], result.questions[i]];
            }
        }
        setParsedQuestions(result.questions);
        setParseErrors(result.errors);

        if (result.questions.length > 0) {
            saveToBank(result.questions);
            setCreateStep(4);
        } else {
            setError('No valid questions found. Check the CSV format.');
        }
    };

    // ── Question Bank Generate Handler ────────────────────────────────
    const handleBankGenerate = async () => {
        setError('');
        setBankLoading(true);
        try {
            const res = await authFetch('/api/questions/generate-for-room', {
                method: 'POST',
                body: JSON.stringify({ examType: selectedExam, subject: bankSubject, count: bankCount }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (!data.questions || data.questions.length === 0) throw new Error('No questions found in your bank for this selection.');
            setParsedQuestions(data.questions);
            setCreateStep(4);
        } catch (err) { setError(err.message); }
        setBankLoading(false);
    };

    const saveToBank = async (questions) => {
        try {
            await authFetch('/api/questions/bulk', {
                method: 'POST',
                body: JSON.stringify({ questions }),
            });
        } catch { }
    };

    // ── Step 4: Create Room ──────────────────────────────────────────
    const handleCreateRoom = async () => {
        setError('');
        if (!hostName.trim()) return setError('Enter your display name.');
        if (!parsedQuestions || parsedQuestions.length === 0) return setError('No questions loaded.');

        setLoading(true);
        try {
            await room.createRoom({
                hostName: hostName.trim(),
                examType: selectedExam,
                testFormat,
                questions: parsedQuestions,
                roomMode,
                enableChat,
                email: user?.email,
                userId: user?.id
            });
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleLateOrRejoinNavigation = (res) => {
        const et = res.room.examType;
        const tf = res.room.testFormat;
        const questions = res.questions || [];
        const currentIdx = res.currentQuestionIndex || 0;
        const targetCode = (room.roomCode || res.room.code).toUpperCase();

        // Check if we have a saved state in localStorage for this specific room code
        let savedState = null;
        try {
            const savedStr = localStorage.getItem(`unmocked_mp_state_${targetCode}`);
            if (savedStr) {
                const parsed = JSON.parse(savedStr);
                if (parsed && Date.now() - parsed.timestamp < 3 * 60 * 60 * 1000) {
                    savedState = parsed;
                }
            }
        } catch (e) { }

        let initialAnswers = {};
        let initialTimeSpent = [];
        let initialTimeLeft = et === 'ssc' ? 60 * 60 : 120 * 60;
        let initialMarked = [];

        if (savedState && savedState.playerName === playerName.trim()) {
            initialAnswers = savedState.answers || {};
            initialTimeSpent = savedState.timeSpent || [];
            initialTimeLeft = savedState.timeLeft !== undefined ? savedState.timeLeft : initialTimeLeft;
            initialMarked = savedState.markedForReview || [];
        } else {
            for (let i = 0; i < currentIdx; i++) {
                initialAnswers[i] = -1;
            }
        }

        if (res.playerHistory) {
            initialAnswers = { ...initialAnswers, ...res.playerHistory.answers };
            for (const [qIdx, t] of Object.entries(res.playerHistory.timeSpent)) {
                initialTimeSpent[Number(qIdx)] = t;
            }
        }

        updateExamState({
            examType: et,
            testFormat: tf,
            questions,
            testStarted: true,
            isMultiplayer: true,
            roomCode: targetCode,
            currentQuestionIndex: currentIdx,
            answers: initialAnswers,
            markedForReview: initialMarked,
            timeSpent: initialTimeSpent,
            timeLeft: initialTimeLeft,
            initialFriendlyRevealData: res.friendlyRevealData,
            initialFriendlyAnswerStatus: res.friendlyAnswerStatus,
        });
        navigate('/test');
    };

    // ── Join Room ────────────────────────────────────────────────────
    const handleJoinRoom = async () => {
        setError('');
        if (!playerName.trim()) return setError('Enter your display name.');

        if (joinLink.trim()) {
            try {
                const url = new URL(joinLink.trim());
                const params = new URLSearchParams(url.search);
                const codeFromLink = params.get('room');
                const serverUrl = url.origin;
                if (!codeFromLink) return setError('Invalid invite link — no room code found.');
                room.setRemoteServerUrl(serverUrl);
                setLoading(true);
                await new Promise(r => setTimeout(r, 600));
                try {
                    const res = await room.joinRoom({ code: codeFromLink, playerName: playerName.trim(), email: user?.email, userId: user?.id });
                    if (res && res.success) {
                        if (res.alreadySubmitted) {
                            navigate('/leaderboard');
                        } else if (res.room && res.room.started) {
                            handleLateOrRejoinNavigation(res);
                        }
                        setLoading(false);
                        return;
                    }
                } catch (err) {
                    setError(err.message);
                    room.resetToLocal();
                }
                setLoading(false);
                return;
            } catch {
                return setError('Invalid invite link format.');
            }
        }

        if (!joinCode.trim() || joinCode.trim().length < 4) return setError('Enter a valid room code or invite link.');
        setLoading(true);
        try {
            const res = await room.joinRoom({ code: joinCode.trim(), playerName: playerName.trim(), email: user?.email, userId: user?.id });
            if (res && res.success) {
                if (res.alreadySubmitted) {
                    navigate('/leaderboard');
                } else if (res.room && res.room.started) {
                    handleLateOrRejoinNavigation(res);
                }
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ── Shared Handlers ──────────────────────────────────────────────
    const handleStartTest = async () => {
        setLoading(true);
        try { await room.startRoom(); } catch (err) { setError(err.message); }
        setLoading(false);
    };

    const getInviteLink = () => {
        return null;
    };

    const getShortInviteLink = () => {
        return getInviteLink();
    };

    const copyCode = async () => {
        const success = await copyToClipboard(room.roomCode);
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const copyInviteLink = async () => {
        const link = getShortInviteLink() || getInviteLink();
        if (link) {
            const success = await copyToClipboard(link);
            if (success) {
                setCopiedInvite(true);
                setTimeout(() => setCopiedInvite(false), 2000);
            }
        }
    };

    const getLanUrl = () => {
        if (lanAddresses.length > 0) {
            return `http://${lanAddresses[0].address}:5173`;
        }
        return `http://${window.location.hostname}:5173`;
    };

    const copyShareMessage = async () => {
        const lanUrl = getLanUrl();
        let msg = `🎯 Join my UnMocked room!\n\n`;
        msg += `🏠 Same WiFi: ${lanUrl}/lobby?room=${room.roomCode}\n`;
        msg += `🔑 Room Code: ${room.roomCode}`;
        const success = await copyToClipboard(msg);
        if (success) {
            setCopiedShareMsg(true);
            setTimeout(() => setCopiedShareMsg(false), 2500);
        }
    };

    const copyPrompt = async () => {
        const success = await copyToClipboard(generatedPrompt);
        if (success) {
            setPromptCopied(true);
            setTimeout(() => setPromptCopied(false), 2000);
        }
    };

    const copyLanLink = async () => {
        const lanUrl = getLanUrl();
        const success = await copyToClipboard(`${lanUrl}/lobby?room=${room.roomCode}`);
        if (success) {
            setCopiedLanLink(true);
            setTimeout(() => setCopiedLanLink(false), 2000);
        }
    };

    // Listen for test start
    useEffect(() => {
        if (!room.socket) return;
        const handler = ({ questions, examType: et, testFormat: tf, roomMode: rm }) => {
            updateExamState({
                examType: et,
                testFormat: tf,
                questions,
                testStarted: true,
                isMultiplayer: true,
                roomCode: room.roomCode,
                currentQuestionIndex: 0,
                answers: {},
                markedForReview: [],
                timeSpent: [],
                timeLeft: et === 'ssc' ? 60 * 60 : 120 * 60,
            });
            navigate('/test');
        };
        room.socket.on('testStarted', handler);
        return () => room.socket.off('testStarted', handler);
    }, [room.socket, room.roomCode, updateExamState, navigate]);

    // ── WAITING LOBBY VIEW ───────────────────────────────────────────
    if (room.roomCode && !room.started) {
        const inviteLink = getInviteLink();
        const lanUrl = getLanUrl();
        return (
            <div className="lobby-container waiting-lobby animate-fade-in">
                <div className="lobby-grid">
                    <div className="lobby-control-panel">
                        <div className="lobby-header">
                            <h1>🏠 Room Lobby</h1>
                            <p>Waiting for host to start the test</p>
                        </div>

                        <Card className="lobby-card">
                            <div className="room-code-display">
                                <span className="room-code-label">Room Code</span>
                                <div className="room-code-value" onClick={copyCode}>
                                    <span>{room.roomCode}</span>
                                    {copied ? <Check size={20} className="text-success" /> : <Copy size={20} />}
                                </div>
                            </div>

                            {/* ── Share & Invite Section ── */}
                            <div className="share-section">
                                <h3 className="share-section-title"><Share2 size={16} /> Share & Invite Friends</h3>

                                {/* Quick Share — copies formatted message */}
                                <button className="share-message-btn" onClick={copyShareMessage}>
                                    {copiedShareMsg ? (
                                        <><Check size={18} /> Invite Copied! Paste in WhatsApp / Telegram</>
                                    ) : (
                                        <><Share2 size={18} /> 📋 Copy Invite Message</>
                                    )}
                                </button>
                                <p className="share-hint">Copies room code + link — paste in WhatsApp, Telegram, etc.</p>

                                {/* LAN Link — always visible */}
                                <div className="share-method">
                                    <div className="share-method-header">
                                        <Monitor size={15} />
                                        <span>Same WiFi / LAN</span>
                                    </div>
                                    <div className="invite-link-row">
                                        <input className="invite-link-input" value={`${lanUrl}/lobby?room=${room.roomCode}`} readOnly onClick={e => e.target.select()} />
                                        <button className="copy-invite-btn" onClick={copyLanLink}>
                                            {copiedLanLink ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                                        </button>
                                    </div>
                                    <p className="share-method-hint">Share this link with friends on the same WiFi network</p>
                                </div>


                            </div>

                            <div className="room-info-badges">
                                <span className="info-badge">{currentTemplate?.name || selectedExam?.toUpperCase()}</span>
                                <span className="info-badge">{roomMode === 'friendly' ? '🎉 Friendly' : '📝 Real Exam'}</span>
                            </div>

                            <div className="participants-section">
                                <h3><Users size={18} /> Participants ({room.participants.length})</h3>
                                <div className="participants-list">
                                    {room.participants.map((p, idx) => (
                                        <div 
                                            key={idx} 
                                            className="participant-item animate-fade-in"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setActiveProfileQuery({ email: p.email, name: p.name })}
                                            title={`Click to view ${p.name}'s performance & exams`}
                                        >
                                            {p.isHost ? (
                                                <Crown size={16} className="text-amber" />
                                            ) : (
                                                <User size={16} />
                                            )}
                                            <span style={{ textDecoration: 'underline', fontWeight: 'normal', opacity: p.connected ? 1 : 0.5 }}>
                                                {p.name} {!p.connected && <span style={{ fontSize: '0.75rem', opacity: 0.8, color: '#f87171', fontStyle: 'italic', marginLeft: '0.3rem' }}>(Offline)</span>}
                                            </span>
                                            {p.isHost && <span className="host-badge">HOST</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {error && <div className="error-message"><span>{error}</span></div>}

                            <div className="lobby-actions">
                                <Button variant="ghost" onClick={() => room.leaveRoom()}>
                                    <ChevronLeft size={16} /> Leave Room
                                </Button>
                                {room.isHost && (
                                    <Button variant="primary" onClick={handleStartTest} disabled={loading || room.participants.filter(p => !p.isConductor).length < 1}>
                                        <Zap size={18} /> Start Test for Everyone
                                    </Button>
                                )}
                            </div>
                        </Card>
                    </div>

                    {room.enableChat && room.socket && (
                        <div className="lobby-chat-column">
                            <FriendlyChat 
                                socket={room.socket} 
                                roomCode={room.roomCode} 
                                displayName={room.playerName} 
                                onUserClick={setActiveProfileQuery}
                                inline={true}
                            />
                        </div>
                    )}
                </div>

                {activeProfileQuery && (
                    <UserProfileModal 
                        queryEmail={activeProfileQuery.email}
                        queryName={activeProfileQuery.name}
                        onClose={() => setActiveProfileQuery(null)}
                    />
                )}
            </div>
        );
    }

    // ── Filter mocks ─────────────────────────────────────────────────
    const filteredMocks = savedMocks.filter(m => m.exam_template_id === selectedExam);

    // ── MAIN LOBBY VIEW ──────────────────────────────────────────────
    return (
        <div className="lobby-container animate-fade-in">
            <div className="lobby-header">
                <h1>🏠 Multiplayer Room</h1>
                <p>Compete with friends — LAN or Internet</p>
                <div className={`connection-status ${room.connected ? 'online' : 'offline'}`}>
                    {room.connected ? <><Wifi size={14} /> Connected</> : <><WifiOff size={14} /> Connecting...</>}
                </div>
            </div>

            <Card className="lobby-card">
                <div className="lobby-tabs">
                    <button className={`lobby-tab ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); setError(''); }}>
                        <Plus size={18} /> Create Room
                    </button>
                    <button className={`lobby-tab ${tab === 'join' ? 'active' : ''}`} onClick={() => { setTab('join'); setError(''); }}>
                        <LogIn size={18} /> Join Room
                    </button>
                </div>

                {/* ═══════════════ CREATE ROOM TAB ═══════════════ */}
                {tab === 'create' && (
                    <div className="tab-content animate-fade-in">

                        {/* Step indicator */}
                        <div className="wizard-steps">
                            <div className={`wizard-step ${createStep >= 1 ? 'active' : ''}`} onClick={() => createStep > 1 && setCreateStep(1)}>1. Exam</div>
                            <div className="wizard-step-line" />
                            <div className={`wizard-step ${createStep >= 2 ? 'active' : ''}`} onClick={() => createStep > 2 && setCreateStep(2)}>2. Format</div>
                            <div className="wizard-step-line" />
                            <div className={`wizard-step ${createStep >= 3 ? 'active' : ''}`} onClick={() => createStep > 3 && setCreateStep(3)}>3. Questions</div>
                            <div className="wizard-step-line" />
                            <div className={`wizard-step ${createStep >= 4 ? 'active' : ''}`}>4. Create</div>
                        </div>

                        {/* ── Step 1: Select Exam ── */}
                        {createStep === 1 && (
                            <div className="wizard-content animate-fade-in">
                                <h3 className="wizard-title">Select Exam Type</h3>
                                <div className="exam-grid">
                                    {Object.values(EXAM_TEMPLATES).map(t => (
                                        <button key={t.id} className={`exam-card ${selectedExam === t.id ? 'selected' : ''}`} onClick={() => handleExamSelect(t.id)}>
                                            <BookOpen size={24} />
                                            <span className="exam-card-name">{t.name}</span>
                                            <span className="exam-card-info">{t.optionsPerQuestion} Options • {t.subjects.length} Subjects</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Step 2: Select Format ── */}
                        {createStep === 2 && currentTemplate && (
                            <div className="wizard-content animate-fade-in">
                                <h3 className="wizard-title">{currentTemplate.name} — Choose Format</h3>

                                <div className="format-grid">
                                    <button
                                        className={`format-card ${testFormat === 'full' ? 'selected' : ''}`}
                                        onClick={() => handleFormatSelect('full')}
                                    >
                                        <Layers size={22} />
                                        <span className="format-card-name">Full Mock</span>
                                        <span className="format-card-info">{currentTemplate.subjects.reduce((s, sub) => s + sub.count, 0)} Questions, All Subjects</span>
                                    </button>
                                    <button
                                        className={`format-card ${testFormat === 'subject' ? 'selected' : ''}`}
                                        onClick={() => handleFormatSelect('subject')}
                                    >
                                        <Library size={22} />
                                        <span className="format-card-name">Subject Wise</span>
                                        <span className="format-card-info">Pick one subject</span>
                                    </button>
                                    <button
                                        className={`format-card ${testFormat === 'topic' ? 'selected' : ''}`}
                                        onClick={() => handleFormatSelect('topic')}
                                    >
                                        <Target size={22} />
                                        <span className="format-card-name">Topic Wise</span>
                                        <span className="format-card-info">Pick a specific topic</span>
                                    </button>
                                </div>

                                {/* Subject picker (for subject/topic format) */}
                                {(testFormat === 'subject' || testFormat === 'topic') && (
                                    <div className="subject-picker animate-fade-in">
                                        <label className="picker-label">Select Subject</label>
                                        <div className="subject-chips">
                                            {currentTemplate.subjects.map(s => (
                                                <button
                                                    key={s.id}
                                                    className={`subject-chip ${selectedSubject === s.id ? 'selected' : ''}`}
                                                    onClick={() => { setSelectedSubject(s.id); setSelectedTopic(''); }}
                                                >
                                                    {s.name} ({s.count}Q)
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Topic picker (for topic format) */}
                                {testFormat === 'topic' && currentSubject && (
                                    <div className="topic-picker animate-fade-in">
                                        <label className="picker-label">Select Topic</label>
                                        <div className="topic-chips">
                                            {currentSubject.topics.map(t => (
                                                <button
                                                    key={t}
                                                    className={`topic-chip ${selectedTopic === t ? 'selected' : ''}`}
                                                    onClick={() => setSelectedTopic(t)}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="form-group" style={{ marginTop: '0.75rem' }}>
                                            <label>Number of Questions</label>
                                            <input
                                                type="number"
                                                className="lobby-input"
                                                value={topicQuestionCount}
                                                onChange={e => setTopicQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                min={1}
                                                max={50}
                                                style={{ maxWidth: '120px' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {error && <div className="error-message"><span>{error}</span></div>}

                                <div className="step-nav">
                                    <Button variant="ghost" onClick={() => setCreateStep(1)}>
                                        <ChevronLeft size={16} /> Back
                                    </Button>
                                    {testFormat && (testFormat === 'full' || selectedSubject) && (testFormat !== 'topic' || selectedTopic) && (
                                        <Button variant="primary" onClick={() => { generatePrompt(); setCreateStep(3); }}>
                                            Next: Load Questions <ChevronRight size={16} />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Step 3: Load Questions (unified with tabs) ── */}
                        {createStep === 3 && (
                            <div className="wizard-content animate-fade-in">
                                <h3 className="wizard-title">📥 Load Questions</h3>

                                {/* Source tabs */}
                                <div className="source-tabs">
                                    <button className={`source-tab ${questionSource === 'ai' ? 'active' : ''}`} onClick={() => setQuestionSource('ai')}>
                                        <Sparkles size={14} /> AI Prompt
                                    </button>
                                    <button className={`source-tab ${questionSource === 'bank' ? 'active' : ''}`} onClick={() => setQuestionSource('bank')}>
                                        <Library size={14} /> Question Bank
                                    </button>
                                    {filteredMocks.length > 0 && (
                                        <button className={`source-tab ${questionSource === 'mock' ? 'active' : ''}`} onClick={() => setQuestionSource('mock')}>
                                            <LayoutTemplate size={14} /> Saved Mock
                                        </button>
                                    )}
                                </div>

                                {/* ─── AI Prompt Source ─── */}
                                {questionSource === 'ai' && (
                                    <div className="source-content animate-fade-in">
                                        <p className="wizard-subtitle">
                                            Copy the prompt, paste into{' '}
                                            <a href="https://chat.deepseek.com" target="_blank" rel="noreferrer">DeepSeek</a>,{' '}
                                            <a href="https://chat.openai.com" target="_blank" rel="noreferrer">ChatGPT</a>,{' '}
                                            <a href="https://gemini.google.com" target="_blank" rel="noreferrer">Gemini</a>, or any AI
                                        </p>

                                        {generatedPrompt && (
                                            <>
                                                <div className="prompt-box">
                                                    <pre>{generatedPrompt}</pre>
                                                </div>
                                                <div className="prompt-actions-row">
                                                    <button className="copy-prompt-btn" onClick={copyPrompt}>
                                                        {promptCopied ? <><ClipboardCheck size={16} /> Copied!</> : <><Copy size={16} /> Copy Prompt</>}
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        <div style={{ marginTop: '1rem' }}>
                                            <label className="picker-label">Paste AI's CSV Output</label>
                                            <textarea
                                                className="json-textarea"
                                                rows={6}
                                                value={aiOutput}
                                                onChange={e => setAiOutput(e.target.value)}
                                                placeholder="Paste CSV output here..."
                                            />
                                        </div>

                                        {parseErrors.length > 0 && (
                                            <div className="error-message">
                                                <span>⚠️ {parseErrors.length} issue(s): {parseErrors.slice(0, 2).join('; ')}</span>
                                            </div>
                                        )}

                                        <Button variant="primary" className="full-width" onClick={handleParseOutput} disabled={!aiOutput.trim()}>
                                            <FileSpreadsheet size={16} /> Parse & Import
                                        </Button>
                                    </div>
                                )}

                                {/* ─── Question Bank Source ─── */}
                                {questionSource === 'bank' && (
                                    <div className="source-content animate-fade-in">
                                        <p className="wizard-subtitle">Generate a random test from your saved Question Bank</p>

                                        {bankSubjects.length === 0 ? (
                                            <div className="error-message">
                                                <span>No questions in your bank for this exam type. Import questions first via AI Prompt, JSON upload, or the Question Bank page.</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="form-group">
                                                    <label>Subject</label>
                                                    <select className="lobby-select" value={bankSubject} onChange={e => setBankSubject(e.target.value)}>
                                                        <option value="all">All Subjects</option>
                                                        {bankSubjects.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Number of Questions</label>
                                                    <input
                                                        type="number"
                                                        className="lobby-input"
                                                        value={bankCount}
                                                        onChange={e => setBankCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                        min={1}
                                                        max={200}
                                                        style={{ maxWidth: '120px' }}
                                                    />
                                                </div>
                                                <Button variant="primary" className="full-width" onClick={handleBankGenerate} disabled={bankLoading}>
                                                    {bankLoading ? <><Loader size={16} className="spin" /> Generating...</> : <><Library size={16} /> Generate from Bank</>}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ─── Saved Mock Source ─── */}
                                {questionSource === 'mock' && filteredMocks.length > 0 && (
                                    <div className="source-content animate-fade-in">
                                        <p className="wizard-subtitle">Load questions from a pre-built mock test</p>
                                        <div className="form-group">
                                            <select className="lobby-select" value={selectedMockId} onChange={e => setSelectedMockId(e.target.value)}>
                                                <option value="">-- Select Saved Mock --</option>
                                                {filteredMocks.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name} ({m.question_count} Qs)</option>
                                                ))}
                                            </select>
                                        </div>
                                        <Button variant="primary" className="full-width" onClick={loadFromMock} disabled={mockLoading || !selectedMockId}>
                                            {mockLoading ? <><Loader size={14} className="spin" /> Loading...</> : <><LayoutTemplate size={16} /> Load Mock</>}
                                        </Button>
                                    </div>
                                )}

                                {error && <div className="error-message"><span>{error}</span></div>}

                                <div className="step-nav">
                                    <Button variant="ghost" onClick={() => setCreateStep(2)}>
                                        <ChevronLeft size={16} /> Back
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* ── Step 4: Room Config & Create ── */}
                        {createStep === 4 && (
                            <div className="wizard-content animate-fade-in">
                                <h3 className="wizard-title">🚀 Create Your Room</h3>

                                <div className="questions-loaded-badge">
                                    ✅ {parsedQuestions.length} questions loaded
                                </div>

                                <div className="form-group">
                                    <label>Your Display Name</label>
                                    <input className="lobby-input" value={hostName} onChange={e => setHostName(e.target.value)} placeholder="e.g. Praveen" />
                                </div>

                                <div className="form-group">
                                    <label>Room Mode</label>
                                    <div className="mini-options">
                                        <button className={roomMode === 'friendly' ? 'selected' : ''} onClick={() => setRoomMode('friendly')}>
                                            🎉 Friendly
                                        </button>
                                        <button className={roomMode === 'exam' ? 'selected' : ''} onClick={() => setRoomMode('exam')}>
                                            📝 Real Exam
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Chat Options</label>
                                    <div className="chat-option-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }} onClick={() => setEnableChat(!enableChat)}>
                                        <input 
                                            type="checkbox" 
                                            id="enableChatCheckbox"
                                            checked={enableChat} 
                                            onChange={(e) => setEnableChat(e.target.checked)} 
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '500' }}>💬 Enable Room Chat</span>
                                    </div>
                                </div>

                                {error && <div className="error-message"><span>{error}</span></div>}

                                <Button variant="primary" className="full-width" onClick={handleCreateRoom} disabled={loading}>
                                    {loading ? 'Creating...' : '🚀 Create Room'}
                                </Button>

                                <div className="step-nav">
                                    <Button variant="ghost" onClick={() => setCreateStep(4)}>
                                        <ChevronLeft size={16} /> Back
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════ JOIN ROOM TAB ═══════════════ */}
                {tab === 'join' && (
                    <div className="tab-content animate-fade-in">
                        <div className="form-group">
                            <label>Your Display Name</label>
                            <input className="lobby-input" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Rahul" />
                        </div>

                        <div className="form-group">
                            <label>🌐 Invite Link <span className="label-hint">(paste the full link from your friend)</span></label>
                            <input className="lobby-input invite-link-join-input" value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="e.g. https://cool-fox-42.loca.lt?room=1234" />
                        </div>

                        <div className="join-divider"><span>OR</span></div>

                        <div className="form-group">
                            <label>Room Code <span className="label-hint">(LAN / same network)</span></label>
                            <input className="lobby-input room-code-input" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. 1234" maxLength={4} />
                        </div>

                        {error && <div className="error-message"><span>{error}</span></div>}

                        <Button variant="primary" className="full-width" onClick={handleJoinRoom} disabled={loading}>
                            {loading ? 'Joining...' : '🎯 Join Room'}
                        </Button>
                    </div>
                )}
            </Card>

            <div className="lobby-back">
                <Button variant="ghost" onClick={() => navigate('/')}>
                    <ChevronLeft size={16} /> Back to Setup
                </Button>
            </div>
        </div>
    );
};

export default Lobby;
