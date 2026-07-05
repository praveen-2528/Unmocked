
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { useAuth } from '../context/AuthContext';
import { useRoom } from '../context/RoomContext';
import { EXAM_TEMPLATES } from '../utils/examTemplates';
import { parseCSVString } from '../utils/csvParser';
import AIChatWidget from '../components/AIChatWidget';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { 
    BookOpen, AlertCircle, Users, Folder, BarChart3, LogOut, 
    Settings as SettingsIcon, Trophy, Library, LayoutTemplate, 
    Sparkles, Loader, UserPlus, FileSpreadsheet, TrendingUp, 
    Award, Clock, Target, LogIn, Quote, ArrowRight, Plus, Calendar,
    User, FileText, Download, Loader2
} from 'lucide-react';
import ScheduleModal from '../components/ScheduleModal';
import './Setup.css';

const QUOTES = [
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Practice makes perfect. The more you practice, the better you get.", author: "Anonymous" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Success doesn't just find you. You have to go out and get it.", author: "Anonymous" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
    { text: "Strive for progress, not perfection.", author: "Anonymous" }
];

const Setup = () => {
    const { examType, testFormat, updateExamState } = useExam();
    const { user, logout, authFetch } = useAuth();
    const room = useRoom();
    const navigate = useNavigate();

    // Practice Setup Wizard State
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [csvInput, setCsvInput] = useState('');
    const [savedMocks, setSavedMocks] = useState([]);
    const [selectedMockId, setSelectedMockId] = useState('');
    const [markingPreset, setMarkingPreset] = useState('ssc'); // 'ssc', 'none', 'custom'
    const [customMarks] = useState({ correct: 2, incorrect: -0.5, unattempted: 0 });
    const [bankSubject, setBankSubject] = useState('all');
    const [bankCount, setBankCount] = useState(25);
    const [bankSubjects, setBankSubjects] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);

    // Today's Study Schedule State
    const [todaySchedule, setTodaySchedule] = useState(null);
    const [checkedTopics, setCheckedTopics] = useState({ 1: false, 2: false, 3: false, 4: false });
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    // Multiplayer Quick Join State
    const [mpPlayerName, setMpPlayerName] = useState(user?.name || '');
    const [mpJoinCode, setMpJoinCode] = useState('');
    const [mpJoinLink, setMpJoinLink] = useState('');
    const [mpError, setMpError] = useState('');
    const [mpLoading, setMpLoading] = useState(false);

    // Multiplayer Rejoin State
    const [savedMpState, setSavedMpState] = useState(null);
    const [rejoining, setRejoining] = useState(false);

    // Active rooms and preview states
    const [activeRooms, setActiveRooms] = useState([]);
    const [selectedRoomPreview, setSelectedRoomPreview] = useState(null);

    // Shared Documents state for homepage preview
    const [recentDocs, setRecentDocs] = useState([]);
    const [allDocsCount, setAllDocsCount] = useState(0);
    const [downloadingDocId, setDownloadingDocId] = useState(null);

    // PDF Viewer Modal state
    const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
    const [pdfViewerTitle, setPdfViewerTitle] = useState('');
    const [showSoloModal, setShowSoloModal] = useState(false);

    // Poll active rooms on mount
    useEffect(() => {
        const fetchActiveRooms = () => {
            fetch('/api/active-rooms')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setActiveRooms(data.rooms || []);
                    }
                })
                .catch(() => {});
        };

        fetchActiveRooms();
        const interval = setInterval(fetchActiveRooms, 4000);
        
    return () => clearInterval(interval);
    }, []);

    // Reactive Room Preview Fetcher
    useEffect(() => {
        if (mpJoinCode.trim().length === 4) {
            fetch(`/api/rooms/${mpJoinCode.trim()}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setSelectedRoomPreview(data.room);
                    } else {
                        setSelectedRoomPreview(null);
                    }
                })
                .catch(() => setSelectedRoomPreview(null));
        } else {
            setSelectedRoomPreview(null);
        }
    }, [mpJoinCode]);

    useEffect(() => {
        // Find all saved multiplayer states
        const keys = Object.keys(localStorage);
        const mpKeys = keys.filter(k => k.startsWith('unmocked_mp_state_'));
        if (mpKeys.length > 0) {
            const states = [];
            mpKeys.forEach(k => {
                try {
                    const state = JSON.parse(localStorage.getItem(k));
                    if (state && state.timestamp) {
                        states.push(state);
                    }
                } catch (e) {
                    localStorage.removeItem(k);
                }
            });

            // Sort by timestamp descending (most recent first)
            states.sort((a, b) => b.timestamp - a.timestamp);

            if (states.length > 0) {
                const mostRecent = states[0];
                // If within 3 hours
                if (Date.now() - mostRecent.timestamp < 3 * 60 * 60 * 1000) {
                    setSavedMpState(mostRecent);
                } else {
                    localStorage.removeItem(`unmocked_mp_state_${mostRecent.roomCode}`);
                }
            }
        }
    }, []);

    const handleDiscardSavedMpState = () => {
        if (savedMpState) {
            localStorage.removeItem(`unmocked_mp_state_${savedMpState.roomCode}`);
            setSavedMpState(null);
        }
    };

    const handleRejoinRoom = async () => {
        if (!savedMpState) return;
        setRejoining(true);
        try {
            const currentName = user?.name || savedMpState.playerName || 'Guest';
            const response = await room.joinRoom({
                code: savedMpState.roomCode,
                playerName: currentName,
                email: user?.email
            });

            if (response.success) {
                const nameChanged = response.nameChanged || (currentName !== savedMpState.playerName);

                // If name changed, mark old answers as skipped (-1)
                let answersToUse = savedMpState.answers || {};
                let timeSpentToUse = savedMpState.timeSpent || [];
                if (nameChanged) {
                    answersToUse = {};
                    timeSpentToUse = [];
                    const currentIdx = response.currentQuestionIndex !== undefined ? response.currentQuestionIndex : savedMpState.currentQuestionIndex;
                    for (let i = 0; i < currentIdx; i++) {
                        answersToUse[i] = -1;
                    }
                }

                updateExamState({
                    examType: savedMpState.examType,
                    testFormat: savedMpState.testFormat,
                    questions: savedMpState.questions,
                    answers: answersToUse,
                    timeSpent: timeSpentToUse,
                    timeLeft: savedMpState.timeLeft,
                    currentQuestionIndex: response.currentQuestionIndex !== undefined ? response.currentQuestionIndex : savedMpState.currentQuestionIndex,
                    isMultiplayer: true,
                    roomCode: savedMpState.roomCode,
                    testStarted: true,
                    initialFriendlyRevealData: response.friendlyRevealData,
                    initialFriendlyAnswerStatus: response.friendlyAnswerStatus,
                });

                navigate('/test');
            }
        } catch (err) {
            alert('Failed to rejoin the room: ' + err.message);
            if (err.message.includes('not found') || err.message.includes('Room not found')) {
                handleDiscardSavedMpState();
            }
        } finally {
            setRejoining(false);
        }
    };

    const handleDownloadDocument = async (docId, filename, fileType) => {
        try {
            setDownloadingDocId(docId);
            const res = await authFetch(`/api/documents/${docId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to download document.');

            const base64Data = data.document.file_data;
            const base64Content = base64Data.includes(';base64,') 
                ? base64Data.split(';base64,')[1] 
                : base64Data;
            
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileType || 'application/octet-stream' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            alert("Error downloading document: " + err.message);
        } finally {
            setDownloadingDocId(null);
        }
    };
    const handleViewPDFDocument = async (docId, filename, fileType) => {
        try {
            setDownloadingDocId(docId);
            const res = await authFetch(`/api/documents/${docId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to view document.');

            const base64Data = data.document.file_data;
            const base64Content = base64Data.includes(';base64,') 
                ? base64Data.split(';base64,')[1] 
                : base64Data;
            
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            
            const fileURL = URL.createObjectURL(blob);
            setPdfViewerUrl(fileURL);
            setPdfViewerTitle(filename);
        } catch (err) {
            alert("Error viewing PDF: " + err.message);
        } finally {
            setDownloadingDocId(null);
        }
    };

    const handleClosePDFViewer = () => {
        if (pdfViewerUrl) {
            URL.revokeObjectURL(pdfViewerUrl);
            setPdfViewerUrl(null);
        }
        setPdfViewerTitle('');
    };

    // Quote Rotation State
    const [quoteIdx, setQuoteIdx] = useState(0);

    // User Test History
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    const markingPresets = {
        ssc: { correct: 2, incorrect: -0.5, unattempted: 0, label: 'SSC Standard (+2 / -0.50)' },
        none: { correct: 1, incorrect: 0, unattempted: 0, label: 'No Negative (+1 / 0)' },
    };

    // 15-second quote changer
    useEffect(() => {
        const interval = setInterval(() => {
            setQuoteIdx((prev) => (prev + 1) % QUOTES.length);
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    // Fetch user mocks & history on mount
    useEffect(() => {
        if (user) {
            authFetch('/api/mocks')
                .then(r => r.json())
                .then(data => setSavedMocks(data.mocks || []))
                .catch(err => console.error("Failed to fetch mocks", err));

            authFetch('/api/history')
                .then(r => r.json())
                .then(data => {
                    setHistory(data.history || []);
                    setHistoryLoading(false);
                })
                .catch(() => setHistoryLoading(false));

            authFetch('/api/documents')
                .then(r => r.json())
                .then(data => {
                    if (data.documents) {
                        setRecentDocs(data.documents.slice(0, 2));
                        setAllDocsCount(data.documents.length);
                    }
                })
                .catch(err => console.error("Failed to fetch documents", err));
        }
    }, [user, authFetch]);

    // Fetch today's study schedule on mount
    useEffect(() => {
        if (user) {
            authFetch('/api/schedule/today')
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.schedule) {
                        setTodaySchedule(data.schedule);
                        const key = `unmocked_study_checked_${user?.email || 'guest'}_${data.schedule.date}`;
                        const saved = localStorage.getItem(key);
                        if (saved) {
                            setCheckedTopics(JSON.parse(saved));
                        } else {
                            setCheckedTopics({ 1: false, 2: false, 3: false, 4: false });
                        }
                    }
                })
                .catch(err => console.error("Failed to fetch schedule", err));
        }
    }, [user, authFetch]);

    const handleTopicCheckToggle = (topicIndex) => {
        if (!todaySchedule) return;
        const newChecked = { ...checkedTopics, [topicIndex]: !checkedTopics[topicIndex] };
        setCheckedTopics(newChecked);
        const key = `unmocked_study_checked_${user?.email || 'guest'}_${todaySchedule.date}`;
        localStorage.setItem(key, JSON.stringify(newChecked));
    };

    // Fetch bank subjects when exam type changes
    useEffect(() => {
        if (user && examType) {
            authFetch(`/api/questions?limit=1&exam_type=${examType}`)
                .then(r => r.json())
                .then(data => setBankSubjects(data.subjects || []))
                .catch(() => { });
        }
    }, [user, examType, authFetch]);

    const getActiveScheme = () => {
        if (markingPreset === 'custom') return customMarks;
        return markingPresets[markingPreset];
    };

    const handleExamTypeSelect = (type) => {
        updateExamState({ examType: type });
        setStep(2);
    };

    const handleFormatSelect = (format) => {
        updateExamState({ testFormat: format });
        setStep(3);
    };

    const startSavedMock = async () => {
        if (!selectedMockId) return setError('Please select a saved mock test.');
        try {
            const res = await authFetch(`/api/mocks/${selectedMockId}/start`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const template = EXAM_TEMPLATES[data.mock.exam_template_id];
            updateExamState({
                questions: data.questions,
                testStarted: true,
                markingScheme: template ? template.markingScheme : getActiveScheme(),
                examType: template ? template.id : examType
            });
            navigate('/test');
        } catch (err) {
            setError(err.message);
        }
    };

    const startFromBank = async () => {
        setError('');
        setBankLoading(true);
        try {
            const res = await authFetch('/api/questions/generate-for-room', {
                method: 'POST',
                body: JSON.stringify({ examType, subject: bankSubject, count: bankCount }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (!data.questions || data.questions.length === 0) throw new Error('No questions found. Import questions first.');
            updateExamState({ questions: data.questions, testStarted: true, markingScheme: getActiveScheme() });
            navigate('/test');
        } catch (err) { setError(err.message); }
        setBankLoading(false);
    };

    const handleCSVParse = () => {
        if (!csvInput.trim()) return;
        setError('');
        let cleaned = csvInput.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:csv)?\n?/, '').replace(/\n?```$/, '');
        }
        const result = parseCSVString(cleaned);
        if (result.questions.length > 0) {
            for (let i = result.questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result.questions[i], result.questions[j]] = [result.questions[j], result.questions[i]];
            }
            updateExamState({ questions: result.questions, testStarted: true, markingScheme: getActiveScheme() });
            navigate('/test');
        } else {
            setError(result.errors.length > 0 ? result.errors.slice(0, 2).join('; ') : 'No valid questions found. Check the CSV format.');
        }
    };

    // Multiplayer quick join
    const handleQuickJoin = async () => {
        setMpError('');
        if (!mpPlayerName.trim()) return setMpError('Enter your display name.');

        let targetCode = mpJoinCode.trim().toUpperCase();

        // Handle full invite link format
        if (mpJoinLink.trim()) {
            try {
                const url = new URL(mpJoinLink.trim());
                const params = new URLSearchParams(url.search);
                const codeFromLink = params.get('room');
                if (!codeFromLink) return setMpError('Invalid invite link — no room code found.');
                room.setRemoteServerUrl(url.origin);
                targetCode = codeFromLink.toUpperCase();
            } catch {
                return setMpError('Invalid invite link format.');
            }
        }

        if (!targetCode || targetCode.length < 4) {
            return setMpError('Enter a valid room code or invite link.');
        }

        setMpLoading(true);
        try {
            const res = await room.joinRoom({ code: targetCode, playerName: mpPlayerName.trim(), email: user?.email });
            if (res && res.success && res.room && res.room.started) {
                // Joined late! Check if we have a saved state in localStorage for this specific room code
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

                const et = res.room.examType;
                const tf = res.room.testFormat;
                const questions = res.questions || [];
                const currentIdx = res.currentQuestionIndex || 0;

                let initialAnswers = {};
                let initialTimeSpent = [];
                let initialTimeLeft = et === 'ssc' ? 60 * 60 : 120 * 60;
                let initialMarked = [];

                if (savedState && savedState.playerName === mpPlayerName.trim()) {
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
            } else {
                navigate('/lobby');
            }
        } catch (err) {
            setMpError(err.message);
            room.resetToLocal();
        } finally {
            setMpLoading(false);
        }
    };

    


    // Process stats for charts
    const stats = useMemo(() => {
        if (history.length === 0) return null;
        const totalTests = history.length;
        const avgScore = history.reduce((s, h) => s + (h.percentage || 0), 0) / totalTests;
        const bestScore = Math.max(...history.map(h => h.percentage || 0));
        const totalTime = history.reduce((s, h) => s + (h.totalTime || 0), 0);
        return { totalTests, avgScore, bestScore, totalTime };
    }, [history]);

    const chartData = useMemo(() => {
        const recent = history.slice(0, 10).reverse(); // last 10 tests, oldest first
        if (recent.length < 2) return null;

        const W = 500, H = 200, P = 30;
        const maxY = 100;
        const stepX = (W - P * 2) / (recent.length - 1);

        const points = recent.map((h, i) => ({
            x: P + i * stepX,
            y: P + (1 - (h.percentage || 0) / maxY) * (H - P * 2),
            pct: (h.percentage || 0).toFixed(0),
            date: new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        }));

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaD = pathD + ` L ${points[points.length - 1].x} ${H - P} L ${points[0].x} ${H - P} Z`;

        return { W, H, P, points, pathD, areaD };
    }, [history]);

    const formatDuration = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const currentQuote = QUOTES[quoteIdx];

    return (
        <div className="home-dashboard-container animate-fade-in">
            {/* Dynamic Aurora Background */}
            <div className="aurora-bg">
                <div className="aurora-blob blob-1"></div>
                <div className="aurora-blob blob-2"></div>
                <div className="aurora-blob blob-3"></div>
            </div>

            {/* Rejoin Multiplayer Banner */}
            {savedMpState && (
                <div className="rejoin-banner glass animate-fade-in" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1.25rem 2rem',
                    marginBottom: '2rem',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    background: 'rgba(245, 158, 11, 0.08)',
                    borderRadius: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <AlertCircle size={28} style={{ color: '#fbbf24' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fbbf24' }}>Active Multiplayer Test Detected</h3>
                            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                You have a running test in Room <strong>{savedMpState.roomCode}</strong> (Mode: {savedMpState.roomMode}).
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Button variant="primary" onClick={handleRejoinRoom} disabled={rejoining}>
                            {rejoining ? 'Rejoining...' : '⚡ Rejoin Test'}
                        </Button>
                        <Button variant="ghost" onClick={handleDiscardSavedMpState} style={{ color: '#ef4444' }}>
                            Discard State
                        </Button>
                    </div>
                </div>
            )}
            {/* User Header Bar */}
            <div className="user-bar glass">
                <span className="user-greeting">👋 Welcome back, <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/profile')} title="Go to profile">{user?.name || 'Guest'}</strong></span>
                    

                <div className="user-actions">
                    {user?.role === 'admin' && (
                        <button className="admin-btn" onClick={() => navigate('/admin')} title="Admin Panel" style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                        }}>
                            🛡️ Admin Panel
                        </button>
                    )}
                    <button className="settings-btn" onClick={() => navigate('/profile')} title="My Profile">
                        <User size={14} /> Profile
                    </button>
                    <button className="settings-btn" onClick={() => navigate('/settings')} title="Settings">
                        <SettingsIcon size={14} /> Settings
                    </button>
                    <button className="logout-btn" onClick={logout}>
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </div>

            


            {/* Hero Brand Title */}
            <div className="setup-header">
                <h1>UnMocked</h1>
                <p>Collaborative competitive exam preparation hub</p>
            </div>

            {/* Main Interactive Grid */}
            <div className="home-grid">
                {/* LEFT COLUMN: Actions */}
                <div className="home-actions-column">
                    
                    {/* Multiplayer Card */}
                    <Card className="home-card multiplayer-card glass">
                        <div className="card-header">
                            <div className="title-icon"><Users size={22} className="text-primary" /></div>
                            <div>
                                <h2>Multiplayer Mode</h2>
                                <p>Compete and solve with friends live</p>
                            </div>
                        </div>

                        <div className="mp-join-form">
                            {/* Active Local Rooms list */}
                            {activeRooms.length > 0 && (
                                <div className="active-rooms-container" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        🌐 Active Local Rooms (Click to Join)
                                    </label>
                                    <div className="active-rooms-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                        {activeRooms.map((r, i) => (
                                            <div 
                                                key={i} 
                                                className="active-room-item glass" 
                                                onClick={() => {
                                                    setMpJoinCode(r.code);
                                                    setMpJoinLink('');
                                                }}
                                                style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center', 
                                                    padding: '0.5rem 0.75rem', 
                                                    borderRadius: '8px', 
                                                    border: '1px solid rgba(255, 255, 255, 0.08)', 
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <div style={{ textAlign: 'left' }}>
                                                    <div style={{ fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                                        Room {r.code} • {r.hostName}'s Room
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                                        {r.examType.toUpperCase()} ({r.roomMode}) • {r.participantCount} player{r.participantCount !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                                <span className={`format-badge ${r.started ? 'multiplayer-badge' : 'friendly-badge'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>
                                                    {r.started ? 'In Test' : 'Lobby'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Your Screen Name</label>
                                <input 
                                    type="text" 
                                    value={mpPlayerName}
                                    onChange={e => setMpPlayerName(e.target.value)}
                                    placeholder="Enter your name..."
                                />
                            </div>

                            <div className="mp-input-row">
                                <div className="form-group flex-1">
                                    <label>Room Code</label>
                                    <input 
                                        type="text" 
                                        value={mpJoinCode}
                                        onChange={e => {
                                            setMpJoinCode(e.target.value);
                                            if (e.target.value.trim()) setMpJoinLink(''); // clear other input
                                        }}
                                        placeholder="e.g., 1234"
                                        maxLength={4}
                                        className="code-input"
                                    />
                                </div>
                                <div className="form-group flex-2">
                                    <label>Or Paste Invite Link</label>
                                    <input 
                                        type="text" 
                                        value={mpJoinLink}
                                        onChange={e => {
                                            setMpJoinLink(e.target.value);
                                            if (e.target.value.trim()) setMpJoinCode(''); // clear other input
                                        }}
                                        placeholder="https://your-domain.com/lobby?room=..."
                                    />
                                </div>
                            </div>

                            {/* Room Preview Panel with Grouped Participants */}
                            {selectedRoomPreview && (
                                <div className="room-preview-box glass animate-fade-in" style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.4)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: '600', fontSize: '0.8rem', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            🏠 Room {selectedRoomPreview.code} Preview
                                        </span>
                                        <span className={`format-badge ${selectedRoomPreview.started ? 'multiplayer-badge' : 'friendly-badge'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>
                                            {selectedRoomPreview.started ? 'In Test' : 'Lobby'}
                                        </span>
                                    </div>
                                    
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', gap: '0.8rem', justifyContent: 'flex-start' }}>
                                        <span><strong>Host:</strong> {selectedRoomPreview.hostName}</span>
                                        <span><strong>Exam:</strong> {selectedRoomPreview.examType.toUpperCase()} ({selectedRoomPreview.roomMode})</span>
                                    </div>

                                    <div style={{ marginBottom: '0.25rem', textAlign: 'left' }}>
                                        <strong style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Players Group:</strong>
                                        {(() => {
                                            const participants = selectedRoomPreview.participants || [];
                                            if (participants.length === 0) {
                                                return <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>No players.</span>;
                                            }

                                            if (!selectedRoomPreview.started) {
                                                return (
                                                    <div>
                                                        <span style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: '600' }}>👥 In Lobby:</span>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                            {participants.map((p, idx) => (
                                                                <span key={idx} className="avatar-chip" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
                                                                    {p.isHost ? '👑 ' : ''}{p.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            const inTest = participants.filter(p => p.connected && !p.hasSubmitted);
                                            const disconnected = participants.filter(p => !p.connected && !p.hasSubmitted);
                                            const finished = participants.filter(p => p.hasSubmitted);

                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {inTest.length > 0 && (
                                                        <div>
                                                            <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: '600' }}>✍️ Solving in Test:</span>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                                {inTest.map((p, idx) => (
                                                                    <span key={idx} className="avatar-chip" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
                                                                        {p.isHost ? '👑 ' : ''}{p.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {disconnected.length > 0 && (
                                                        <div>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600' }}>💤 Lobby / Disconnected:</span>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                                {disconnected.map((p, idx) => (
                                                                    <span key={idx} className="avatar-chip" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
                                                                        {p.isHost ? '👑 ' : ''}{p.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {finished.length > 0 && (
                                                        <div>
                                                            <span style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: '600' }}>🏁 Finished:</span>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                                {finished.map((p, idx) => (
                                                                    <span key={idx} className="avatar-chip" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>
                                                                        {p.isHost ? '👑 ' : ''}{p.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {mpError && (
                                <div className="error-message">
                                    <AlertCircle size={14} />
                                    <span>{mpError}</span>
                                </div>
                            )}

                            <div className="mp-buttons-row">
                                <Button 
                                    variant="primary" 
                                    onClick={handleQuickJoin} 
                                    disabled={mpLoading}
                                    className="flex-1"
                                >
                                    {mpLoading ? <><Loader size={16} className="spin" /> Joining...</> : <><LogIn size={16} /> Join Room</>}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => navigate('/lobby?tab=create')}
                                    className="create-room-btn"
                                >
                                    <Plus size={16} /> Create Room
                                </Button>
                            </div>
                        </div>
                    </Card>

                    </div>

                {/* COLUMN 2: AI Assistant */}
                <div className="home-ai-column">
                    <AIChatWidget height="calc(100vh - 280px)" user={user} history={history} />
                </div>
            </div>

            <div className="home-grid" style={{ marginTop: '0' }}>
                <div className="home-actions-column">
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
                    </Card>
                \n                    
                    {/* Quick Explore Card (Replaces Chart) */}
                    <Card className="home-card glass">
                        <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                            <div className="title-icon"><LayoutTemplate size={22} className="text-primary" /></div>
                            <div>
                                <h2>Explore More</h2>
                                <p>Quick access to all UnMocked tools</p>
                            </div>
                        </div>
                        <div className="quick-actions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.75rem' }}>
                            <button className="quick-action-btn primary-tint" onClick={() => navigate('/mock-builder')}>
                    <LayoutTemplate size={24} />
                    <span>Mock Builder</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/question-bank')}>
                    <Library size={24} />
                    <span>Question Bank</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/global-leaderboard')}>
                    <Trophy size={24} />
                    <span>Global Leaderboard</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/dashboard')}>
                    <BarChart3 size={24} />
                    <span>Full Analytics</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/profile')}>
                    <User size={24} />
                    <span>My Profile</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/friends')}>
                    <UserPlus size={24} />
                    <span>Friends</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/saved')}>
                    <Folder size={24} />
                    <span>Saved Exams</span>
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/documents')}>
                    <FileText size={24} />
                    <span>Shared Docs</span>
                </button>
                <button className="quick-action-btn ai-tint" onClick={() => navigate('/ai-generator')}>
                    <Sparkles size={24} />
                    <span>AI Prompt Generator</span>
                </button>
                        </div>
                    </Card>

                </div>
                <div className="home-dashboard-column">
                    {/* Performance Graphs Card */}
                    <Card className="home-card graph-card glass">
                        <div className="card-header">
                            <div className="title-icon"><TrendingUp size={22} className="text-emerald" /></div>
                            <div>
                                <h2>Performance Overview</h2>
                                <p>Analyze your solo practice results</p>
                            </div>
                        </div>

                        {historyLoading ? (
                            <div className="graph-placeholder"><Loader className="spin" /> Loading stats...</div>
                        ) : history.length === 0 ? (
                            <div className="graph-placeholder empty">
                                <BarChart3 size={32} />
                                <p>No practice test data available yet.</p>
                                <span className="sub-hint">Perform some practice mock tests or CSV uploads to view your score trends and stats graph.</span>
                            </div>
                        ) : (
                            <div className="dashboard-stats-content">
                                {/* SVG Graph */}
                                {chartData ? (
                                    <div className="svg-trend-wrap">
                                        <svg viewBox={`0 0 ${chartData.W} ${chartData.H}`} className="dashboard-trend-chart">
                                            <defs>
                                                <linearGradient id="areaGradHome" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            
                                            {/* Y Grid lines */}
                                            {[0, 50, 100].map(pct => {
                                                const y = chartData.P + (1 - pct / 100) * (chartData.H - chartData.P * 2);
                                                return (
                                                    <g key={pct}>
                                                        <line x1={chartData.P} y1={y} x2={chartData.W - chartData.P} y2={y} className="grid-line" />
                                                        <text x={chartData.P - 6} y={y + 4} className="axis-label" textAnchor="end">{pct}%</text>
                                                    </g>
                                                );
                                            })}

                                            <path d={chartData.areaD} fill="url(#areaGradHome)" />
                                            <path d={chartData.pathD} className="trend-line-emerald" />
                                            
                                            {chartData.points.map((p, i) => (
                                                <g key={i}>
                                                    <circle cx={p.x} cy={p.y} r="4.5" className="trend-dot-emerald" />
                                                    <title>{p.date}: {p.pct}%</title>
                                                </g>
                                            ))}
                                        </svg>
                                    </div>
                                ) : (
                                    <div className="graph-placeholder empty">
                                        <p>Not enough test history to plot trend line.</p>
                                        <span className="sub-hint">Complete at least 2 tests to unlock the trend graph.</span>
                                    </div>
                                )}

                                {/* Key stats grid */}
                                {stats && (
                                    <div className="quick-stats-grid">
                                        <div className="quick-stat-box">
                                            <span className="stat-num text-success">{stats.avgScore.toFixed(0)}%</span>
                                            <span className="stat-lbl">Average Score</span>
                                        </div>
                                        <div className="quick-stat-box">
                                            <span className="stat-num text-gold">{stats.bestScore.toFixed(0)}%</span>
                                            <span className="stat-lbl">Best Score</span>
                                        </div>
                                        <div className="quick-stat-box">
                                            <span className="stat-num">{stats.totalTests}</span>
                                            <span className="stat-lbl">Exams Taken</span>
                                        </div>
                                        <div className="quick-stat-box">
                                            <span className="stat-num">{formatDuration(stats.totalTime)}</span>
                                            <span className="stat-lbl">Total Time</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {showScheduleModal && (
                <ScheduleModal onClose={() => setShowScheduleModal(false)} />
            )}

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
                                                <div className="solo-practice-wizard">
                            <div className="steps-indicator inline-steps">
                                <div className={`step ${step >= 1 ? 'active' : ''}`} onClick={() => setStep(1)}>1. Exam</div>
                                <div className="step-line"></div>
                                <div className={`step ${step >= 2 ? 'active' : ''}`} onClick={() => step > 1 && setStep(2)}>2. Format</div>
                                <div className="step-line"></div>
                                <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Load</div>
                            </div>

                            {/* Step 1: Select Exam Type */}
                            {step === 1 && (
                                <div className="step-content animate-fade-in">
                                    <div className="wizard-list-options">
                                        {Object.values(EXAM_TEMPLATES).map(t => (
                                            <button
                                                key={t.id}
                                                className={`wizard-row-btn ${examType === t.id ? 'selected' : ''}`}
                                                onClick={() => handleExamTypeSelect(t.id)}
                                            >
                                                <div className="icon-wrapper"><BookOpen size={16} /></div>
                                                <div className="btn-label-text">
                                                    <strong>{t.name}</strong>
                                                    <span>{t.subjects.length} Subjects • {t.optionsPerQuestion} Options</span>
                                                </div>
                                                <ArrowRight size={14} className="arrow-next" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Test Format */}
                            {step === 2 && (
                                <div className="step-content animate-fade-in">
                                    <div className="wizard-list-options">
                                        <button onClick={() => handleFormatSelect('full')} className="wizard-row-btn">
                                            <div className="icon-wrapper"><LayoutTemplate size={16} /></div>
                                            <div className="btn-label-text">
                                                <strong>Full Mock Test</strong>
                                                <span>A comprehensive test covering all sections</span>
                                            </div>
                                            <ArrowRight size={14} className="arrow-next" />
                                        </button>
                                        <button onClick={() => handleFormatSelect('subject')} className="wizard-row-btn">
                                            <div className="icon-wrapper"><Library size={16} /></div>
                                            <div className="btn-label-text">
                                                <strong>Subject Wise Practice</strong>
                                                <span>Practice one specific subject section</span>
                                            </div>
                                            <ArrowRight size={14} className="arrow-next" />
                                        </button>
                                        <button onClick={() => handleFormatSelect('topic')} className="wizard-row-btn">
                                            <div className="icon-wrapper"><Target size={16} /></div>
                                            <div className="btn-label-text">
                                                <strong>Topic Wise Drill</strong>
                                                <span>Focus practice on a specific micro-topic</span>
                                            </div>
                                            <ArrowRight size={14} className="arrow-next" />
                                        </button>
                                    </div>
                                    <Button variant="ghost" onClick={() => setStep(1)} className="wizard-back-btn">Back to Exam Selection</Button>
                                </div>
                            )}

                            {/* Step 3: Load Data & Configure */}
                            {step === 3 && (
                                <div className="step-content data-load-step animate-fade-in">
                                    {/* Mocks */}
                                    {savedMocks.length > 0 && testFormat === 'full' && (
                                        <div className="sub-load-method">
                                            <label className="sub-label"><LayoutTemplate size={14} /> Launch Pre-Built Mock</label>
                                            <div className="input-with-button">
                                                <select value={selectedMockId} onChange={e => setSelectedMockId(e.target.value)}>
                                                    <option value="">-- Choose Mock --</option>
                                                    {savedMocks.filter(m => m.exam_template_id === examType).map(m => (
                                                        <option key={m.id} value={m.id}>{m.name} ({m.question_count} Qs)</option>
                                                    ))}
                                                </select>
                                                <Button variant="primary" onClick={startSavedMock} disabled={!selectedMockId}>Launch</Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Bank Generation */}
                                    {bankSubjects.length > 0 && (
                                        <div className="sub-load-method">
                                            <label className="sub-label"><Library size={14} /> Generate from Question Bank</label>
                                            <div className="input-with-button">
                                                <select value={bankSubject} onChange={e => setBankSubject(e.target.value)} className="flex-2">
                                                    <option value="all">All Subjects</option>
                                                    {bankSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <input 
                                                    type="number" 
                                                    value={bankCount} 
                                                    onChange={e => setBankCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                    style={{ maxWidth: '60px' }}
                                                />
                                                <Button variant="primary" onClick={startFromBank} disabled={bankLoading}>
                                                    {bankLoading ? 'Loading...' : 'Generate'}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Paste CSV */}
                                    <div className="sub-load-method">
                                        <label className="sub-label"><FileSpreadsheet size={14} /> Paste CSV Questions</label>
                                        <textarea
                                            rows={3}
                                            value={csvInput}
                                            onChange={e => setCsvInput(e.target.value)}
                                            placeholder="question,option_a,option_b,option_c,option_d,correct_option,explanation..."
                                            className="quick-textarea"
                                        />
                                        <Button variant="primary" onClick={handleCSVParse} disabled={!csvInput.trim()} className="w-full mt-2">
                                            Parse & Practice
                                        </Button>
                                    </div>

                                    {/* Override preset */}
                                    <div className="quick-marking-override">
                                        <span className="override-title">Override Marking Scheme</span>
                                        <div className="override-presets">
                                            <button className={`preset-pill ${markingPreset === 'ssc' ? 'active' : ''}`} onClick={() => setMarkingPreset('ssc')}>+2 / -0.5</button>
                                            <button className={`preset-pill ${markingPreset === 'none' ? 'active' : ''}`} onClick={() => setMarkingPreset('none')}>+1 / 0</button>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="error-message">
                                            <AlertCircle size={14} />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <Button variant="ghost" onClick={() => setStep(2)} className="wizard-back-btn">Back to Format</Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {pdfViewerUrl && (
                <div className="pdf-viewer-modal-backdrop" onClick={handleClosePDFViewer}>
                    <div className="pdf-viewer-modal-content glass" onClick={(e) => e.stopPropagation()}>
                        <div className="pdf-viewer-header">
                            <div className="pdf-viewer-title-area">
                                <FileText size={18} className="text-primary" style={{ color: '#818cf8' }} />
                                <h3>{pdfViewerTitle}</h3>
                            </div>
                            <button className="pdf-viewer-close-btn" onClick={handleClosePDFViewer}>&times;</button>
                        </div>
                        <div className="pdf-viewer-body">
                            <iframe src={pdfViewerUrl} width="100%" height="100%" title={pdfViewerTitle} frameBorder="0" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Setup;
