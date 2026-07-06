import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import { saveExam, getSavedExams, loadExam } from '../utils/storage';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, List, Play, Pause, SaveAll, Bookmark, Save, Users, MessageSquare, Send, Flame, Frown, Rocket, Skull, PartyPopper, Smile } from 'lucide-react';
import BadgeIcon from '../components/BadgeSVGs';
import UserProfileModal from '../components/UserProfileModal';
import QuestionRenderer from '../components/QuestionRenderer';
import FriendlyChat from '../components/FriendlyChat';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import './Test.css';

class TestErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Test.jsx Render Error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ color: 'red', padding: '2rem', background: '#fff', height: '100vh' }}>
                    <h2>Test UI Crashed</h2>
                    <pre>{this.state.error?.toString()}</pre>
                    <button onClick={() => window.location.reload()}>Refresh Page</button>
                </div>
            );
        }
        return this.props.children;
    }
}

const preprocessLaTeX = (text) => {
    if (typeof text !== 'string') return text;
    return text
        .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
        .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
};

// Seating Arrangement Helpers
const isSeatingArrangement = (q, testFormat) => {
    if (!q) return false;
    const isTopicFormat = testFormat === 'topic';
    const topic = (q.topic || '').toLowerCase();
    const type = (q.questionType || q.question_type || '').toLowerCase();
    return isTopicFormat && (topic.includes('seating arrangement') || type === 'seating_arrangement');
};

const getSeatingArrangementType = (q) => {
    if (!q) return 'linear';
    const text = (q.text || '').toLowerCase();
    const subtopic = (q.subtopic || '').toLowerCase();
    
    if (text.includes('circular') || text.includes('circle') || text.includes('round table') || subtopic.includes('circular')) {
        return 'circular';
    }
    if (text.includes('parallel') || text.includes('two rows') || text.includes('facing each other') || subtopic.includes('parallel')) {
        return 'parallel';
    }
    return 'linear';
};

const getMembersCount = (q) => {
    if (!q) return 0;
    if (q.membersCount) return q.membersCount;
    const correctVal = q.options[q.correctAnswer];
    if (!correctVal || typeof correctVal !== 'string') return 0;
    const members = correctVal.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return members.length;
};

const normalizeSequence = (str) => {
    if (typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

const TestInner = () => {
    const { 
        examType: contextExamType, testFormat: contextTestFormat, questions: contextQuestions, testStarted, currentQuestionIndex = 0, updateExamState, 
        answers: contextAnswers, markedForReview: contextMarkedForReview, timeSpent: contextTimeSpent, timeLeft: savedTimeLeft, isMultiplayer, roomCode, _saveId,
        initialFriendlyRevealData, initialFriendlyAnswerStatus, markingScheme, loadSavedState
    } = useExam();

    const examType = contextExamType || 'ssc';
    const testFormat = contextTestFormat || 'full';
    const questions = contextQuestions || [];
    const answers = contextAnswers || {};
    const markedForReview = contextMarkedForReview || [];
    const timeSpent = contextTimeSpent || [];
    const { authFetch, user } = useAuth();
    const room = useRoom();
    const navigate = useNavigate();
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);
    const [timeLeft, setTimeLeft] = useState(() => {
        if (savedTimeLeft) return savedTimeLeft;
        return examType === 'ssc' ? 60 * 60 : 120 * 60;
    });
    const [hasReadInstructions, setHasReadInstructions] = useState(() => {
        const hasAnswers = Object.keys(answers || {}).length > 0;
        if (hasAnswers) return true;
        if (isMultiplayer && room.examStarted) return true;
        return false;
    });
    const [examStarted, setExamStarted] = useState(room.examStarted || false);
    const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
    const [saveToast, setSaveToast] = useState(false);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const autoSaveRef = useRef(null);

    // Badge tracking & notifications
    const [activeBadgeAnimations, setActiveBadgeAnimations] = useState([]);
    const speedDemonStreakRef = useRef(0);
    const answeredCorrectlyInStreakRef = useRef(new Set());
    const speedDemonAwardedRef = useRef(false);
    const [showSpeedDemonAlert, setShowSpeedDemonAlert] = useState(false);

    const triggerSpeedDemonUnlock = () => {
        speedDemonAwardedRef.current = true;
        speedDemonStreakRef.current = 0;
        answeredCorrectlyInStreakRef.current.clear();
        
        setShowSpeedDemonAlert(true);
        setTimeout(() => setShowSpeedDemonAlert(false), 5000);

        authFetch('/api/gamification/unlock-badge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ badgeKey: 'speed_demon' })
        })
        .then(r => r.json())
        .then(data => {
            if (data.newlyUnlocked && isMultiplayer && room.socket) {
                room.socket.emit('badgeEarned', {
                    code: roomCode,
                    badgeKey: 'speed_demon',
                    earnedCount: data.earnedCount || 1
                });
            } else if (data.newlyUnlocked && !isMultiplayer) {
                // For solo mode, just push to local animations
                setActiveBadgeAnimations(prev => [...prev, {
                    id: Date.now(),
                    userName: user?.name || 'You',
                    badgeKey: 'speed_demon',
                    earnedCount: data.earnedCount || 1
                }]);
                setTimeout(() => {
                    setActiveBadgeAnimations(prev => prev.filter(b => b.id !== Date.now()));
                }, 5000);
            }
        })
        .catch(err => console.error("Error unlocking Speed Demon badge:", err));
    };

    // Socket listener for incoming badge animations
    useEffect(() => {
        if (!room.socket) return;
        const handleBadgeEarned = (data) => {
            const animId = Date.now() + Math.random();
            setActiveBadgeAnimations(prev => [...prev, { ...data, id: animId }]);
            setTimeout(() => {
                setActiveBadgeAnimations(prev => prev.filter(b => b.id !== animId));
            }, 5000);
        };
        room.socket.on('userBadgeEarned', handleBadgeEarned);
        return () => {
            room.socket.off('userBadgeEarned', handleBadgeEarned);
        };
    }, [room.socket]);

    // Live Emotes tracking
    const [activeEmotes, setActiveEmotes] = useState([]);

    useEffect(() => {
        if (!room.socket) return;
        const handleReceiveEmote = (data) => {
            setActiveEmotes(prev => [...prev, data]);
            setTimeout(() => {
                setActiveEmotes(prev => prev.filter(e => e.id !== data.id));
            }, 3000);
        };
        room.socket.on('receiveEmote', handleReceiveEmote);
        return () => room.socket.off('receiveEmote', handleReceiveEmote);
    }, [room.socket]);

    const sendEmote = (emoteKey) => {
        if (!room.socket) return;
        room.socket.emit('sendEmote', { code: roomCode, emoteKey });
    };

    const EmoteIcon = ({ emoteKey, size = 24 }) => {
        switch (emoteKey) {
            case 'flame': return <Flame size={size} color="#f97316" />;
            case 'frown': return <Frown size={size} color="#3b82f6" />;
            case 'rocket': return <Rocket size={size} color="#8b5cf6" />;
            case 'skull': return <Skull size={size} color="#94a3b8" />;
            case 'party': return <PartyPopper size={size} color="#ec4899" />;
            case 'smile': return <Smile size={size} color="#eab308" />;
            default: return null;
        }
    };

    // Friendly mode states
    const isFriendly = isMultiplayer && room.roomMode === 'friendly';
    const isExamMode = isMultiplayer && room.roomMode === 'exam';
    const [friendlyAnswered, setFriendlyAnswered] = useState(() => {
        return answers[currentQuestionIndex] !== undefined;
    });
    const [friendlyWaiting, setFriendlyWaiting] = useState(() => {
        return answers[currentQuestionIndex] !== undefined && !initialFriendlyRevealData;
    });
    const [friendlyRevealed, setFriendlyRevealed] = useState(!!initialFriendlyRevealData);
    const [friendlyRevealData, setFriendlyRevealData] = useState(initialFriendlyRevealData || null);
    const [friendlyAnswerStatus, setFriendlyAnswerStatus] = useState(initialFriendlyAnswerStatus || { answeredCount: 0, totalParticipants: 0, answeredPlayers: [] });

    // Friendly mode question history navigation & reveals tracking
    const [roomActiveQuestionIndex, setRoomActiveQuestionIndex] = useState(currentQuestionIndex);
    const [friendlyReveals, setFriendlyReveals] = useState({});

    // Sidebar Chat states
    const [activeTab, setActiveTab] = useState('players');
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [unreadChat, setUnreadChat] = useState(false);
    const chatEndRef = useRef(null);

    const [zoomLevel, setZoomLevel] = useState(1);
    const [chatOpen, setChatOpen] = useState(false);

    // Lock body scroll only while on this page
    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, []);

    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    const chatOpenRef = useRef(chatOpen);
    useEffect(() => {
        chatOpenRef.current = chatOpen;
        if (chatOpen || activeTab === 'chat') {
            setUnreadChat(false);
        }
    }, [chatOpen, activeTab]);

    const unreadTimeoutRef = useRef(null);
    useEffect(() => {
        if (!room.socket) return;
        const onChatMessage = (msg) => {
            setMessages(prev => [...prev, msg]);
            if (activeTabRef.current !== 'chat' && !chatOpenRef.current) {
                setUnreadChat(true);
                if (unreadTimeoutRef.current) clearTimeout(unreadTimeoutRef.current);
                unreadTimeoutRef.current = setTimeout(() => {
                    setUnreadChat(false);
                }, 3000);
            }
        };
        room.socket.on('chatMessage', onChatMessage);
        return () => room.socket.off('chatMessage', onChatMessage);
    }, [room.socket]);

    useEffect(() => {
        if (activeTab === 'chat') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeTab]);

    const handleSendChat = () => {
        const text = chatInput.trim();
        if (!text || !room.socket) return;
        room.socket.emit('chatSend', { code: roomCode, text });
        setChatInput('');
    };

    const currentQuestionIndexRef = useRef(currentQuestionIndex);
    useEffect(() => {
        currentQuestionIndexRef.current = currentQuestionIndex;
    }, [currentQuestionIndex]);

    const handleSubmit = (autoSubmit = false) => {
        let score = 0;
        let correct = 0;
        let incorrect = 0;
        Object.keys(answers).forEach((qIndex) => {
            const val = answers[qIndex];
            if (val !== undefined && val !== -1 && val !== '') {
                const q = questions[qIndex];
                const isCorrect = isSeatingArrangement(q, testFormat)
                    ? normalizeSequence(val) === normalizeSequence(q.options[q.correctAnswer])
                    : val === q.correctAnswer;
                if (isCorrect) {
                    score += 1;
                    correct += 1;
                } else {
                    incorrect += 1;
                }
            }
        });

        const doSubmit = () => {
            updateExamState({ timeLeft });

            if (isMultiplayer && roomCode) {
                const totalTimeSecs = timeSpent.reduce((sum, t) => sum + (t || 0), 0);
                const localStartHour = new Date(Date.now() - (totalTimeSecs * 1000)).getHours();
                localStorage.removeItem(`unmocked_mp_state_${roomCode}`);
                room.submitResults({
                    answers,
                    timeSpent,
                    score,
                    total: questions.length,
                    correct,
                    incorrect,
                    markingScheme,
                    localStartHour,
                }).then(() => {
                    navigate('/leaderboard');
                }).catch(() => {
                    navigate('/leaderboard');
                });
            } else {
                navigate('/results');
            }
        };

        if (autoSubmit) {
            doSubmit();
        } else if (window.confirm("Are you sure you want to completely finish and submit the test?")) {
            doSubmit();
        }
    };

    const handleFinalSubmit = () => {
        handleSubmit(true);
    };

    // Auto-submit when time is up
    useEffect(() => {
        if (testStarted && timeLeft !== null && timeLeft <= 0 && !confirmSubmit) {
            // Prevent multiple submissions
            if (room?.results && room.results.some(r => (r.email && user && r.email === user.email) || r.playerName === user?.name || r.playerName === room.playerName)) return;
            
            handleSubmit(true);
        }
    }, [timeLeft, testStarted, confirmSubmit, room, user]);

    const getPauseStats = () => {
        const stats = {};
        questions.forEach((q, idx) => {
            const subject = q.subject || q.topic || 'General';
            if (!stats[subject]) {
                stats[subject] = { total: 0, attempted: 0, correct: 0, incorrect: 0 };
            }
            stats[subject].total += 1;
            
            const val = answers[idx];
            if (val !== undefined && val !== -1 && val !== '') {
                stats[subject].attempted += 1;
                
                if (isMultiplayer) {
                    const isCorrect = isSeatingArrangement(q, testFormat)
                        ? normalizeSequence(val) === normalizeSequence(q.options[q.correctAnswer])
                        : val === q.correctAnswer;
                    if (isCorrect) stats[subject].correct += 1;
                    else stats[subject].incorrect += 1;
                }
            }
        });
        return stats;
    };

    useEffect(() => {
        if (!testStarted || questions.length === 0) {
            const savedExams = getSavedExams();
            if (savedExams.length > 0) {
                const fullExam = loadExam(savedExams[0].id);
                if (fullExam && !fullExam.isMultiplayer && !isMultiplayer) {
                    loadSavedState(fullExam);
                    return;
                }
            }
            navigate('/');
            return;
        }

        // Prevent re-taking a submitted test
        if (isMultiplayer && roomCode && room) {
            if (room.alreadySubmitted) {
                navigate('/leaderboard');
                return;
            }
            if (room.results) {
                const hasSubmitted = room.results.some(r => 
                    (r.email && user && r.email === user.email) || 
                    (r.playerName === user?.name) ||
                    (r.playerName === room.playerName)
                );
                if (hasSubmitted) {
                    navigate('/leaderboard');
                    return;
                }
            }
        }
    }, [testStarted, questions, navigate, isMultiplayer, roomCode, room?.results, user, room]);

    // Consolidated Per-Question Timer
    useEffect(() => {
        let timer;
        // In friendly mode, ensure we only tick on the active room question
        const isFriendlyActive = !isFriendly || (currentQuestionIndex === roomActiveQuestionIndex && !friendlyAnswered && !friendlyRevealed);
        
        if (testStarted && questions.length > 0 && hasReadInstructions && isFriendlyActive && !isPaused) {
            timer = setInterval(() => {
                updateExamState(prev => {
                    const newTimeSpent = [...(prev.timeSpent || [])];
                    newTimeSpent[currentQuestionIndex] = (newTimeSpent[currentQuestionIndex] || 0) + 1;
                    return { timeSpent: newTimeSpent };
                });
                if (!isMultiplayer || room?.roomMode === 'exam') {
                    setTimeLeft(prev => prev - 1);
                }
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [testStarted, questions, currentQuestionIndex, updateExamState, isFriendly, roomActiveQuestionIndex, friendlyAnswered, friendlyRevealed, hasReadInstructions, isPaused]);

    // Auto-save every 60 seconds (solo mode only)
    useEffect(() => {
        if (isMultiplayer || !testStarted) return;

        autoSaveRef.current = setInterval(() => {
            saveExam({
                examType, testFormat, questions, answers, markedForReview,
                timeSpent, currentQuestionIndex, timeLeft, _saveId,
            });
        }, 60000);

        return () => clearInterval(autoSaveRef.current);
    }, [isMultiplayer, testStarted, examType, testFormat, questions, answers, markedForReview, timeSpent, currentQuestionIndex, timeLeft, _saveId]);

    // Sync multiplayer state to localStorage and Server
    useEffect(() => {
        if (isMultiplayer && testStarted && roomCode) {
            localStorage.setItem(`unmocked_mp_state_${roomCode}`, JSON.stringify({
                roomCode,
                questions,
                answers,
                timeSpent,
                currentQuestionIndex,
                examType,
                testFormat,
                playerName: room.playerName,
                roomMode: room.roomMode,
                timestamp: Date.now()
            }));

            // Sync to server for exam mode "middle submissions"
            if (room?.roomMode === 'exam' && room?.socket) {
                room.socket.emit('syncExamState', {
                    code: roomCode,
                    answers,
                    timeSpent,
                    timeLeft
                });
            }
        }
    }, [isMultiplayer, testStarted, roomCode, answers, timeSpent, currentQuestionIndex, questions, examType, testFormat, room.playerName, room.roomMode, timeLeft]);

    const isConductor = isMultiplayer && room.isConductor;

    // Send progress updates in exam mode (non-conductor players only)
    useEffect(() => {
        if (isMultiplayer && isExamMode && roomCode && !isConductor) {
            const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== -1 && answers[k] !== '').length;
            let liveScore = 0;
            questions.forEach((q, qIndex) => {
                const val = answers[qIndex];
                if (val !== undefined && val !== -1 && val !== '') {
                    const isCorrect = isSeatingArrangement(q, testFormat)
                        ? normalizeSequence(val) === normalizeSequence(q.options[q.correctAnswer])
                        : val === q.correctAnswer;
                    if (isCorrect) {
                        liveScore += 1;
                    }
                }
            });
            room.socket?.emit('examProgress', {
                code: roomCode,
                questionIndex: currentQuestionIndex,
                answeredCount,
                liveScore
            });
        }
    }, [isMultiplayer, isExamMode, roomCode, currentQuestionIndex, answers, isConductor, room.socket, questions, testFormat]);

    // Conductor auto-redirect to leaderboard when all players submit
    useEffect(() => {
        if (isMultiplayer && room.isConductor && room.roomMode === 'exam') {
            const activePlayers = (room.participants || []).filter(p => !p.isConductor);
            const totalPlayersCount = activePlayers.length;
            const submittedCount = (room.results || []).length;
            if (totalPlayersCount > 0 && submittedCount === totalPlayersCount) {
                navigate('/leaderboard');
            }
        }
    }, [isMultiplayer, room.isConductor, room.roomMode, room.participants, room.results, navigate]);

    // ── Friendly Mode Socket Listeners ──────────────────────────────────
    useEffect(() => {
        if (!isFriendly || !room.socket) return;

        const onAnswerStatus = (data) => {
            setFriendlyAnswerStatus(data);
        };

        const onReveal = (data) => {
            setFriendlyRevealed(true);
            setFriendlyWaiting(false);
            setFriendlyRevealData(data);
            setFriendlyReveals(prev => ({ ...prev, [data.questionIndex]: data }));
        };

        const onNextQuestion = ({ questionIndex }) => {
            // Reset friendly state for new question
            setFriendlyAnswered(false);
            setFriendlyWaiting(false);
            setFriendlyRevealed(false);
            setFriendlyRevealData(null);
            setFriendlyAnswerStatus({ answeredCount: 0, totalParticipants: 0, answeredPlayers: [] });
            
            setRoomActiveQuestionIndex(questionIndex);
            if (currentQuestionIndexRef.current === questionIndex - 1) {
                updateExamState({ currentQuestionIndex: questionIndex });
            }
        };

        room.socket.on('friendlyAnswerStatus', onAnswerStatus);
        room.socket.on('friendlyReveal', onReveal);
        room.socket.on('friendlyNextQuestion', onNextQuestion);

        return () => {
            room.socket.off('friendlyAnswerStatus', onAnswerStatus);
            room.socket.off('friendlyReveal', onReveal);
            room.socket.off('friendlyNextQuestion', onNextQuestion);
        };
    }, [isFriendly, room.socket, updateExamState]);

    // Listen for force submit event globally across all multiplayer modes
    useEffect(() => {
        if (!isMultiplayer || !room.socket) return;
        const onForceSubmit = () => {
            handleSubmit(true);
        };
        room.socket.on('friendlyForceSubmit', onForceSubmit);
        return () => {
            room.socket.off('friendlyForceSubmit', onForceSubmit);
        };
    }, [isMultiplayer, room.socket, answers, timeSpent]);

    // Sync examStarted state if room state changes
    useEffect(() => {
        if (isMultiplayer && room.examStarted) {
            setExamStarted(true);
            setHasReadInstructions(true);
        }
    }, [isMultiplayer, room.examStarted]);

    // Socket listener for examStarted broadcast
    useEffect(() => {
        if (!isMultiplayer || !room.socket) return;

        const onExamStarted = () => {
            setExamStarted(true);
            setHasReadInstructions(true);
        };

        room.socket.on('examStarted', onExamStarted);

        return () => {
            room.socket.off('examStarted', onExamStarted);
        };
    }, [isMultiplayer, room.socket]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const currentQuestion = questions[currentQuestionIndex];

    const isQuestionRevealed = isFriendly ? (currentQuestionIndex < roomActiveQuestionIndex || friendlyRevealed) : false;
    const questionRevealData = isFriendly ? (currentQuestionIndex < roomActiveQuestionIndex ? friendlyReveals[currentQuestionIndex] : friendlyRevealData) : null;

    const handleBoxChange = (i, value, N) => {
        const char = value.slice(-1).toUpperCase();
        const currentVal = answers[currentQuestionIndex] || '';
        
        const arr = [];
        for (let idx = 0; idx < N; idx++) {
            if (idx === i) {
                arr.push(char || ' ');
            } else {
                arr.push(currentVal[idx] || ' ');
            }
        }
        const newVal = arr.join('');
        
        const newAnswers = { ...answers, [currentQuestionIndex]: newVal };
        updateExamState({ answers: newAnswers });
        
        if (char && char !== ' ' && i < N - 1) {
            setTimeout(() => {
                document.getElementById(`seating-box-${currentQuestionIndex}-${i + 1}`)?.focus();
            }, 10);
        }
    };

    const handleBoxKeyDown = (i, e, N) => {
        if (e.key === 'Backspace') {
            const currentVal = answers[currentQuestionIndex] || '';
            const char = currentVal[i] || ' ';
            if (char === ' ' || !char) {
                if (i > 0) {
                    setTimeout(() => {
                        const prev = document.getElementById(`seating-box-${currentQuestionIndex}-${i - 1}`);
                        prev?.focus();
                    }, 10);
                }
            }
        } else if (e.key === 'ArrowLeft' && i > 0) {
            document.getElementById(`seating-box-${currentQuestionIndex}-${i - 1}`)?.focus();
        } else if (e.key === 'ArrowRight' && i < N - 1) {
            document.getElementById(`seating-box-${currentQuestionIndex}-${i + 1}`)?.focus();
        }
    };

    const handleOptionSelect = (optionIndex) => {
        if (isFriendly && (currentQuestionIndex < roomActiveQuestionIndex || friendlyAnswered)) return;

        const isCurrentlySelected = answers[currentQuestionIndex] === optionIndex;
        const newAnswers = { ...answers, [currentQuestionIndex]: isCurrentlySelected ? undefined : optionIndex };
        updateExamState({ answers: newAnswers });
        
        if (isCurrentlySelected) return; // If unselecting, we don't trigger speed demon logic

        // Speed Demon tracking for Solo and Exam modes
        if (!isFriendly) {
            const q = questions[currentQuestionIndex];
            const isCorrect = optionIndex === q.correctAnswer;
            const timeUsed = timeSpent[currentQuestionIndex] || 0;

            if (isCorrect && timeUsed <= 5) {
                if (!answeredCorrectlyInStreakRef.current.has(currentQuestionIndex)) {
                    answeredCorrectlyInStreakRef.current.add(currentQuestionIndex);
                    speedDemonStreakRef.current += 1;
                    if (speedDemonStreakRef.current >= 5) {
                        triggerSpeedDemonUnlock();
                    }
                }
            } else {
                speedDemonStreakRef.current = 0;
                answeredCorrectlyInStreakRef.current.clear();
            }
        }
    };

    const handleSaveAnswer = () => {
        if (answers[currentQuestionIndex] === undefined) return;
        
        setFriendlyAnswered(true);
        setFriendlyWaiting(true);

        const timeTaken = timeSpent[currentQuestionIndex] || 0;

        // Speed Demon tracking for Friendly mode
        if (isFriendly) {
            const q = questions[currentQuestionIndex];
            const optionIndex = answers[currentQuestionIndex];
            const isCorrect = isSeatingArrangement(q, testFormat)
                ? normalizeSequence(optionIndex) === normalizeSequence(q.options[q.correctAnswer])
                : optionIndex === q.correctAnswer;

            if (isCorrect && timeTaken <= 5) {
                if (!answeredCorrectlyInStreakRef.current.has(currentQuestionIndex)) {
                    answeredCorrectlyInStreakRef.current.add(currentQuestionIndex);
                    speedDemonStreakRef.current += 1;
                    if (speedDemonStreakRef.current >= 5) {
                        triggerSpeedDemonUnlock();
                    }
                }
            } else {
                speedDemonStreakRef.current = 0;
                answeredCorrectlyInStreakRef.current.clear();
            }
        }

        room.socket?.emit('friendlyAnswer', {
            code: roomCode,
            questionIndex: currentQuestionIndex,
            optionIndex: answers[currentQuestionIndex],
            timeSpentSec: timeTaken,
        }, () => { });
    };

    const handleIndividualSkip = () => {
        const newAnswers = { ...answers, [currentQuestionIndex]: -1 };
        updateExamState({ answers: newAnswers });
        
        setFriendlyAnswered(true);
        setFriendlyWaiting(true);

        const timeTaken = timeSpent[currentQuestionIndex] || 0;

        room.socket?.emit('friendlyAnswer', {
            code: roomCode,
            questionIndex: currentQuestionIndex,
            optionIndex: -1,
            timeSpentSec: timeTaken,
        }, () => { });
    };

    const handleNext = () => {
        if (currentQuestionIndex < questions.length - 1) {
            if (isFriendly) {
                if (friendlyRevealed && room.isHost) {
                    room.socket?.emit('friendlyNext', { code: roomCode }, () => { });
                }
                return;
            }
            const nextIdx = currentQuestionIndex + 1;
            updateExamState({ currentQuestionIndex: nextIdx });
        }
    };

    const handleReviewAndNext = () => {
        if (isFriendly) return; // No mark-for-review in friendly mode
        const newReview = new Set(markedForReview || []);
        if (newReview.has(currentQuestionIndex)) {
            newReview.delete(currentQuestionIndex);
        } else {
            newReview.add(currentQuestionIndex);
        }
        updateExamState({ markedForReview: Array.from(newReview) });
        handleNext();
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            const prevIdx = currentQuestionIndex - 1;
            updateExamState({ currentQuestionIndex: prevIdx });
        }
    };

    const jumpToQuestion = (index) => {
        if (isFriendly && index > roomActiveQuestionIndex) return; // No jumping beyond active question in friendly mode
        updateExamState({ currentQuestionIndex: index });
        if (window.innerWidth < 768) {
            setIsPaletteCollapsed(false);
        }
    };

    const handlePartialSubmit = () => {
        let score = 0;
        let attempted = Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== -1 && answers[k] !== '').length;
        Object.keys(answers).forEach((qIndex) => {
            const val = answers[qIndex];
            if (val !== undefined && val !== -1 && val !== '') {
                const q = questions[qIndex];
                const isCorrect = isSeatingArrangement(q, testFormat)
                    ? normalizeSequence(val) === normalizeSequence(q.options[q.correctAnswer])
                    : val === q.correctAnswer;
                if (isCorrect) {
                    score += 1;
                }
            }
        });
        alert(`Mid-way Progress check:\n\nYou have answered ${attempted} out of ${questions.length} questions.\nYour current score is ${score}/${questions.length}.\n\nYou can keep going!`);
    };

    const handleSaveAndExit = () => {
        const id = saveExam({
            examType, testFormat, questions, answers, markedForReview,
            timeSpent, currentQuestionIndex, timeLeft, _saveId,
        });
        updateExamState({ _saveId: id });
        setSaveToast(true);
        setTimeout(() => {
            navigate('/');
        }, 1000);
    };


    const renderConductorDashboard = () => {
        const activePlayers = (room.participants || []).filter(p => !p.isConductor);
        const totalPlayersCount = activePlayers.length;
        const submittedCount = (room.results || []).length;
        const allSubmittedState = room.allSubmitted || (totalPlayersCount > 0 && submittedCount === totalPlayersCount);

        const handleForceReveal = () => {
            room.socket?.emit('friendlyForceReveal', { code: roomCode });
        };

        const handleFriendlyNext = () => {
            room.socket?.emit('friendlyNext', { code: roomCode });
        };

        const handleForceFinish = () => {
            if (window.confirm("Are you sure you want to end the test for all participants?")) {
                room.socket?.emit('friendlyFinish', { code: roomCode }, () => {});
            }
        };

        return (
            <div className="test-layout">
                {/* Top Header */}
                <header className="test-header glass">
                    <div className="exam-info">
                        <h2>🛡️ Conductor Dashboard</h2>
                        <span className="format-badge">Host Mode</span>
                        <span className="format-badge multiplayer-badge">🏠 Room: {roomCode}</span>
                        <span className="format-badge friendly-badge">🔑 Serial: {room.testCode || 'N/A'}</span>
                    </div>

                    <div className="header-controls">
                        <div className="friendly-progress-badge">
                            <Users size={16} />
                            <span>{submittedCount}/{totalPlayersCount} Submitted</span>
                        </div>
                    </div>
                </header>

                <div className="test-content">
                    <main className="question-area">
                        <Card className="question-card" style={{ padding: '2rem' }}>
                            <div className="conductor-summary-card">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    📊 Room Progress Monitor ({room.roomMode === 'friendly' ? 'Friendly Mode' : 'Exam Mode'})
                                </h3>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                    You are conducting this test. Players are taking the test, and you can monitor their progress below in real-time.
                                </p>

                                {/* Progress Indicator */}
                                {room.roomMode === 'exam' && (
                                    <div className="progress-bar-container" style={{ margin: '1.5rem 0', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--card-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                            <span>Submissions Progress</span>
                                            <strong>{submittedCount} / {totalPlayersCount} Players</strong>
                                        </div>
                                        <div style={{ width: '100%', height: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '5px', overflow: 'hidden' }}>
                                            <div style={{ width: `${totalPlayersCount > 0 ? (submittedCount / totalPlayersCount) * 100 : 0}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                                        </div>
                                    </div>
                                )}

                                {/* Action Controls */}
                                <div className="conductor-actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                                    {room.roomMode === 'friendly' ? (
                                        <>
                                            {!friendlyRevealed ? (
                                                <Button variant="primary" onClick={handleForceReveal}>
                                                    👁️ Force Reveal Answer (Q{currentQuestionIndex + 1})
                                                </Button>
                                            ) : (
                                                (currentQuestionIndex < questions.length - 1 && !isLastQuestion) ? (
                                                    <Button variant="primary" onClick={handleFriendlyNext}>
                                                        ⏩ Next Question
                                                    </Button>
                                                ) : null
                                            )}
                                            <Button variant="danger" onClick={handleForceFinish}>
                                                🛑 End Test for All
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            {!examStarted && (
                                                <Button 
                                                    variant="primary" 
                                                    onClick={() => {
                                                        room.socket?.emit('startExam', { code: roomCode });
                                                        setExamStarted(true);
                                                    }}
                                                    style={{ background: 'var(--success, #10b981)', borderColor: 'var(--success, #10b981)' }}
                                                >
                                                    🚀 Start Exam for All Players
                                                </Button>
                                            )}
                                            <Button variant="danger" onClick={handleForceFinish}>
                                                🛑 End & Force Submit Room
                                            </Button>
                                            {allSubmittedState && (
                                                <Button variant="primary" onClick={() => navigate('/leaderboard')}>
                                                    🏆 View Leaderboard
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Active Players Table */}
                                <h4 style={{ marginBottom: '1rem' }}>👥 Player Status List</h4>
                                <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <table className="leaderboard-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Player Name</th>
                                                <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Connection</th>
                                                <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Progress</th>
                                                <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Submission</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activePlayers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                                        No players in this room yet.
                                                    </td>
                                                </tr>
                                            ) : (
                                                activePlayers.map((p, idx) => {
                                                    const result = (room.results || []).find(r => r.playerName === p.name || (p.email && r.email === p.email));
                                                    const hasSubmitted = !!result;

                                                    // Determine progress details
                                                    let progressText = '⏳ Waiting';
                                                    if (room.roomMode === 'friendly') {
                                                        const isCurrentActive = currentQuestionIndex === roomActiveQuestionIndex;
                                                        const answeredPlayer = isCurrentActive && friendlyAnswerStatus.answeredPlayers?.find(ap => ap.name === p.name);
                                                        const hasAnswered = !!answeredPlayer;
                                                        const revealData = questionRevealData?.playerChoices?.[p.name];

                                                        if (revealData) {
                                                            progressText = revealData.choice === -1 ? '⏩ Skipped' : `Picked ${String.fromCharCode(65 + revealData.choice)} (${revealData.isCorrect ? '✅' : '❌'})`;
                                                        } else if (hasAnswered) {
                                                            progressText = '✅ Answered';
                                                        } else {
                                                            progressText = '⏳ Answering Q' + (currentQuestionIndex + 1);
                                                        }
                                                    } else {
                                                        // Exam mode
                                                        if (hasSubmitted) {
                                                            progressText = `Completed (${result.marks !== undefined ? `${result.marks} marks` : `${result.correct}/${result.total}`})`;
                                                        } else {
                                                            const answered = p.answeredCount || 0;
                                                            progressText = `Answering Q${(p.currentQuestionIndex || 0) + 1} (${answered}/${questions.length})`;
                                                        }
                                                    }

                                                    return (
                                                        <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                                            <td style={{ padding: '0.75rem', fontWeight: '600' }}>{p.name}</td>
                                                            <td style={{ padding: '0.75rem' }}>
                                                                <span style={{
                                                                    fontSize: '0.75rem',
                                                                    padding: '0.2rem 0.5rem',
                                                                    borderRadius: '4px',
                                                                    background: p.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                                    color: p.connected ? '#34d399' : '#f87171'
                                                                }}>
                                                                    {p.connected ? 'Online' : 'Offline'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.75rem' }}>{progressText}</td>
                                                            <td style={{ padding: '0.75rem' }}>
                                                                {hasSubmitted ? (
                                                                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>✓ Submitted</span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-secondary)' }}>Pending</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    </main>

                    {/* Conductor Sidebar Chat / Players list */}
                    <aside className="mp-player-panel glass">
                        <div className="mp-panel-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.2)' }}>
                            <button 
                                onClick={() => setActiveTab('players')} 
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    border: 'none',
                                    background: activeTab === 'players' ? 'rgba(255,255,255,0.05)' : 'none',
                                    color: activeTab === 'players' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'players' ? '2px solid var(--primary)' : 'none'
                                }}
                            >
                                <Users size={12} style={{ marginRight: '0.25rem', display: 'inline' }} /> Players
                            </button>
                            <button 
                                onClick={() => {
                                    setActiveTab('chat');
                                    setUnreadChat(false);
                                }} 
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    border: 'none',
                                    background: activeTab === 'chat' ? 'rgba(255,255,255,0.05)' : 'none',
                                    color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    borderBottom: activeTab === 'chat' ? '2px solid var(--primary)' : 'none'
                                }}
                            >
                                <MessageSquare size={12} style={{ marginRight: '0.25rem', display: 'inline' }} /> Chat
                                {unreadChat && (
                                    <span className="unread-dot" style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '12px',
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: '#ef4444',
                                        boxShadow: '0 0 8px #ef4444'
                                    }} />
                                )}
                            </button>
                        </div>

                        {activeTab === 'players' ? (
                            <div className="mp-player-list">
                                {activePlayers.map((p, idx) => (
                                    <div key={idx} className="mp-player-row">
                                        <span className="mp-player-name">{p.name}</span>
                                        <span className="mp-player-status">
                                            {p.connected ? '🟢' : '🔴'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="test-chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                                {isMultiplayer && room.socket && (
                                    <FriendlyChat 
                                        socket={room.socket} 
                                        roomCode={roomCode} 
                                        displayName={user?.name}
                                        inline={true}
                                        onUserClick={setActiveProfileQuery}
                                    />
                                )}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        );
    };

    const renderInstructions = () => {
        const durationMins = Math.round(timeLeft / 60);
        const scheme = markingScheme || { correct: 2, incorrect: -0.5, unattempted: 0 };
        return (
            <div className="instructions-container animate-fade-in">
                <div className="instructions-card glass">
                    <div className="instructions-header">
                        <Play size={24} className="text-primary" style={{ marginRight: '0.5rem' }} />
                        <h2>Exam Instructions & Guidelines</h2>
                    </div>

                    <div className="instructions-meta-grid">
                        <div className="instructions-meta-item">
                            <span className="instructions-meta-label">Exam Type</span>
                            <span className="instructions-meta-value">{examType ? examType.toUpperCase() : 'SSC'} Mock</span>
                        </div>
                        <div className="instructions-meta-item">
                            <span className="instructions-meta-label">Total Questions</span>
                            <span className="instructions-meta-value">{questions.length} Questions</span>
                        </div>
                        <div className="instructions-meta-item">
                            <span className="instructions-meta-label">Duration</span>
                            <span className="instructions-meta-value">{durationMins} Minutes</span>
                        </div>
                        <div className="instructions-meta-item">
                            <span className="instructions-meta-label">Marking Scheme</span>
                            <span className="instructions-meta-value">
                                +{scheme.correct} / {scheme.incorrect}
                            </span>
                        </div>
                    </div>

                    <h3 className="instructions-section-title">📌 Important Guidelines</h3>
                    <ul className="instructions-list">
                        <li>Ensure you have a stable internet connection before starting.</li>
                        <li>Do not refresh or close the page during the test, as this will reset your timer.</li>
                        <li>You can skip questions and answer them later using the question navigation palette.</li>
                        <li>Mark questions as "Review" if you are unsure of the answer and want to revisit them.</li>
                        {isMultiplayer && (
                            <li><strong>Multiplayer Mode:</strong> This is a shared lobby. The test will submit when you finish, and you will see the lobby leaderboard.</li>
                        )}
                        <li>Click the button below to start the test and begin the timer. Good luck!</li>
                    </ul>

                    {isMultiplayer ? (
                        room.isHost ? (
                            <Button 
                                variant="primary" 
                                className="instructions-start-btn" 
                                onClick={() => {
                                    room.socket?.emit('startExam', { code: roomCode });
                                    setHasReadInstructions(true);
                                }}
                            >
                                Begin Test & Start Exam for All
                            </Button>
                        ) : (
                            <div className="instructions-waiting glass" style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                textAlign: 'center',
                                border: '1px solid var(--card-border)',
                                background: 'rgba(255,255,255,0.02)',
                                marginTop: '1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem',
                                color: 'var(--text-secondary)'
                            }}>
                                <div className="waiting-spinner" style={{ width: '20px', height: '20px', border: '2px solid var(--text-secondary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <span>Waiting for host to start the exam...</span>
                            </div>
                        )
                    ) : (
                        <Button 
                            variant="primary" 
                            className="instructions-start-btn" 
                            onClick={() => setHasReadInstructions(true)}
                        >
                            Begin Test
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    if (isConductor && !isFriendly) {
        return renderConductorDashboard();
    }

    if (!testStarted) return <div style={{padding:'2rem'}}>Loading test data...</div>;
    if (!currentQuestion) return <div style={{padding:'2rem'}}>Loading question...</div>;

    if (!hasReadInstructions) {
        return renderInstructions();
    }

    const renderSeatingArrangement = (q) => {
        const N = getMembersCount(q);
        const type = getSeatingArrangementType(q);
        const answerVal = answers[currentQuestionIndex] || '';
        const reveal = isQuestionRevealed ? (friendlyReveals[currentQuestionIndex] || friendlyRevealData) : null;
        const correctAnsIndex = reveal ? reveal.correctAnswer : q.correctAnswer;
        const revealCorrectSequence = normalizeSequence(q.options[correctAnsIndex]);

        const isDisabled = isFriendly && (currentQuestionIndex < roomActiveQuestionIndex || friendlyAnswered || friendlyRevealed);

        // Linear layout
        const renderLinear = (seq, isRevealLayout = false, userSeq = null) => {
            const items = [];
            for (let i = 0; i < N; i++) {
                const char = (seq[i] || ' ').trim();
                let boxClass = "seating-box-input";
                if (isRevealLayout) {
                    const matches = char.toUpperCase() === (userSeq?.[i] || '').toUpperCase();
                    boxClass += matches ? " correct-box" : " incorrect-box";
                }
                items.push(
                    <div key={i} className="seating-box-wrapper">
                        <span className="seating-box-label">{i + 1}</span>
                        <input
                            id={`seating-box-${currentQuestionIndex}-${i}${isRevealLayout ? '-reveal' : ''}`}
                            type="text"
                            maxLength={1}
                            className={boxClass}
                            value={char}
                            disabled={isDisabled || isRevealLayout}
                            onChange={(e) => handleBoxChange(i, e.target.value, N)}
                            onKeyDown={(e) => handleBoxKeyDown(i, e, N)}
                            placeholder="?"
                        />
                    </div>
                );
            }
            return (
                <div className="seating-layout-linear animate-fade-in">
                    {items}
                </div>
            );
        };

        // Circular layout
        const renderCircular = (seq, isRevealLayout = false, userSeq = null) => {
            const items = [];
            const radius = 95; // pixels (slightly adjusted for spacing)
            for (let i = 0; i < N; i++) {
                const char = (seq[i] || ' ').trim();
                const angle = (i * 2 * Math.PI) / N - Math.PI / 2; // start at top
                const x = Math.round(radius * Math.cos(angle));
                const y = Math.round(radius * Math.sin(angle));

                let boxClass = "seating-box-input";
                if (isRevealLayout) {
                    const matches = char.toUpperCase() === (userSeq?.[i] || '').toUpperCase();
                    boxClass += matches ? " correct-box" : " incorrect-box";
                }

                items.push(
                    <div 
                        key={i} 
                        className="seating-box-wrapper"
                        style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}px - 21px)`,
                            top: `calc(50% + ${y}px - 21px)`,
                        }}
                    >
                        <span className="seating-box-label circular-label">{i + 1}</span>
                        <input
                            id={`seating-box-${currentQuestionIndex}-${i}${isRevealLayout ? '-reveal' : ''}`}
                            type="text"
                            maxLength={1}
                            className={boxClass}
                            value={char}
                            disabled={isDisabled || isRevealLayout}
                            onChange={(e) => handleBoxChange(i, e.target.value, N)}
                            onKeyDown={(e) => handleBoxKeyDown(i, e, N)}
                            placeholder="?"
                            style={{ width: '42px', height: '42px', fontSize: '1.1rem' }}
                        />
                    </div>
                );
            }
            return (
                <div className="seating-layout-circular animate-fade-in">
                    <div className="seating-circle-table">
                        <div className="circle-table-center">
                            <span>TABLE</span>
                        </div>
                        {items}
                    </div>
                </div>
            );
        };

        // Parallel layout
        const renderParallel = (seq, isRevealLayout = false, userSeq = null) => {
            const half = Math.ceil(N / 2);
            const row1 = [];
            const row2 = [];

            for (let i = 0; i < N; i++) {
                const char = (seq[i] || ' ').trim();
                let boxClass = "seating-box-input";
                if (isRevealLayout) {
                    const matches = char.toUpperCase() === (userSeq?.[i] || '').toUpperCase();
                    boxClass += matches ? " correct-box" : " incorrect-box";
                }

                const element = (
                    <div key={i} className="seating-box-wrapper">
                        <span className="seating-box-label">{i + 1}</span>
                        <input
                            id={`seating-box-${currentQuestionIndex}-${i}${isRevealLayout ? '-reveal' : ''}`}
                            type="text"
                            maxLength={1}
                            className={boxClass}
                            value={char}
                            disabled={isDisabled || isRevealLayout}
                            onChange={(e) => handleBoxChange(i, e.target.value, N)}
                            onKeyDown={(e) => handleBoxKeyDown(i, e, N)}
                            placeholder="?"
                        />
                    </div>
                );

                if (i < half) {
                    row1.push(element);
                } else {
                    row2.push(element);
                }
            }

            return (
                <div className="seating-layout-parallel animate-fade-in">
                    <div className="parallel-row row-north">
                        <span className="row-indicator">Row 1 (Facing South)</span>
                        <div className="parallel-boxes">{row1}</div>
                    </div>
                    <div className="parallel-divider">
                        <div className="divider-arrows">↓ ↓ ↓ ↓ ↓</div>
                        <div className="divider-line"></div>
                        <div className="divider-arrows">↑ ↑ ↑ ↑ ↑</div>
                    </div>
                    <div className="parallel-row row-south">
                        <div className="parallel-boxes">{row2}</div>
                        <span className="row-indicator">Row 2 (Facing North)</span>
                    </div>
                </div>
            );
        };

        const renderLayout = (seq, isRevealLayout = false, userSeq = null) => {
            if (type === 'circular') return renderCircular(seq, isRevealLayout, userSeq);
            if (type === 'parallel') return renderParallel(seq, isRevealLayout, userSeq);
            return renderLinear(seq, isRevealLayout, userSeq);
        };

        return (
            <div className="seating-arrangement-container glass">
                {!isQuestionRevealed ? (
                    <>
                        <h4 className="seating-container-title">Arrange the sequence:</h4>
                        {renderLayout(answerVal)}
                        <p className="seating-helper-text">Click any seat and type a letter. Use ← → keys to navigate.</p>
                    </>
                ) : (
                    <div className="seating-reveal-container">
                        <div className="seating-reveal-section">
                            <h4 className="seating-container-title text-slate-300">Your Arrangement:</h4>
                            {renderLayout(answerVal, true, revealCorrectSequence)}
                        </div>
                        <div className="seating-reveal-section correct-section">
                            <h4 className="seating-container-title text-emerald-400">Correct Arrangement:</h4>
                            {renderLayout(revealCorrectSequence)}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Determine option class in friendly reveal mode
    const getOptionClass = (optIdx) => {
        let cls = 'option-item';

        if (isFriendly && isQuestionRevealed && questionRevealData) {
            if (optIdx === questionRevealData.correctAnswer) {
                cls += ' revealed-correct';
            } else if (answers[currentQuestionIndex] === optIdx) {
                cls += ' revealed-wrong';
            }
        } else if (answers[currentQuestionIndex] === optIdx) {
            cls += ' selected';
        }

        if (isFriendly && currentQuestionIndex === roomActiveQuestionIndex && friendlyAnswered && !friendlyRevealed) {
            cls += ' locked';
        }

        return cls;
    };

    const isLastQuestion = currentQuestionIndex === questions.length - 1;

    // Grid Status
    const getGridStatus = (index) => {
        // In friendly mode, after reveal, reflect correctness
        if (isFriendly && friendlyReveals[index] && friendlyReveals[index].playerChoices) {
            const myChoice = friendlyReveals[index].playerChoices[room.playerName];
            if (myChoice) {
                if (myChoice.isCorrect) return 'answered';
                return 'not-answered'; // Wrong or skipped
            }
        }

        if (answers[index] !== undefined && answers[index] !== -1 && answers[index] !== '') return 'answered';
        if (Array.isArray(markedForReview) && markedForReview.includes(index)) return 'marked';
        if (answers[index] === -1) return 'not-answered';
        if (timeSpent[index] > 0 || index === currentQuestionIndex) return 'not-answered';
        return 'not-visited';
    };

    const getAnsweredCount = () => Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== -1 && answers[k] !== '').length;
    const getMarkedCount = () => Array.isArray(markedForReview) ? markedForReview.length : 0;
    const getNotAnsweredCount = () => {
        let count = 0;
        for (let i = 0; i < questions.length; i++) {
            if (answers[i] === undefined && timeSpent[i] > 0) count++;
        }
        return count;
    };

    const hasPlayerAnsweredQuestion = (pName, idx) => {
        if (idx < roomActiveQuestionIndex) {
            return friendlyReveals[idx]?.playerChoices?.[pName] !== undefined;
        }
        if (idx === roomActiveQuestionIndex) {
            if (friendlyRevealed) {
                return friendlyRevealData?.playerChoices?.[pName] !== undefined;
            } else {
                return friendlyAnswerStatus.answeredPlayers?.some(ap => ap.name === pName);
            }
        }
        return false;
    };

    const isAnswered = answers[currentQuestionIndex] !== undefined && answers[currentQuestionIndex] !== -1 && answers[currentQuestionIndex] !== '';

    // Friendly Host Actions
    const handleForceReveal = () => {
        if (room.isHost) {
            room.socket.emit('friendlyForceReveal', { code: roomCode });
        }
    };
    const handleSkipForAll = () => {
        if (room.isHost) {
            room.socket.emit('friendlyNext', { code: roomCode });
        }
    };
    const handleNextFriendly = () => {
        if (room.isHost) {
            room.socket.emit('friendlyNext', { code: roomCode });
        }
    };
    const handleFinishFriendly = () => {
        if (room.isHost) {
            room.socket.emit('friendlyFinish', { code: roomCode });
        }
    };

    return (
        <div className="test-engine-container" style={{ fontSize: `${zoomLevel}rem` }}>
            
            {/* Badge Animation Overlay */}
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                pointerEvents: 'none', zIndex: 9999, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center', gap: '20px'
            }}>
                {activeBadgeAnimations.map(anim => (
                    <div key={anim.id} style={{
                        animation: 'badge-pulse 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        background: 'rgba(15, 23, 42, 0.9)', padding: '40px 60px', borderRadius: '24px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 50px rgba(99,102,241,0.6)',
                        border: '2px solid rgba(99,102,241,0.5)', backdropFilter: 'blur(10px)',
                        transformOrigin: 'center'
                    }}>
                        <BadgeIcon badgeKey={anim.badgeKey} size={180} animated={true} />
                        <div style={{ marginTop: '25px', color: 'white', fontSize: '2.5rem', fontWeight: 'bold', textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                            <span style={{ color: '#a5b4fc' }}>{anim.userName}</span> earned a badge!
                        </div>
                        {anim.earnedCount > 1 && (
                            <div style={{
                                marginTop: '15px', background: 'linear-gradient(45deg, #f59e0b, #ef4444)',
                                padding: '8px 20px', borderRadius: '30px', fontSize: '1.5rem', fontWeight: 'bold', color: 'white',
                                boxShadow: '0 4px 15px rgba(239,68,68,0.5)'
                            }}>
                                x{anim.earnedCount} Multiplier!
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Floating Live Emotes (Removed per user request) */}

            {/* Top Header */}
            <header className="te-top-header">
                <div className="te-header-left">
                    <div className="te-logo">
                        <h1>UnMocked</h1>
                        <span>{examType.toUpperCase()} {testFormat.replace('-', ' ')}</span>
                    </div>
                </div>

                <div className="te-header-center">
                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={() => setZoomLevel(z => Math.min(z + 0.1, 1.5))}>Zoom (+)</button>
                        <button className="zoom-btn" onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.8))}>Zoom (-)</button>
                    </div>
                    <h2>General Intelligence & Reasoning Su...</h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Roll No : {roomCode || 'SOLO-MODE'}
                    </span>
                </div>

                <div className="te-header-right">
                    {room?.roomMode === 'exam' && (
                        <div className="te-timer-box" style={{ display: 'flex', alignItems: 'center', marginRight: '0.5rem', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span className="time-label" style={{ color: '#e74c3c' }}>Time Left</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="time-value" style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                                        {formatTime(timeLeft)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="te-timer-box" style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span className="time-label">Time Spent</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="time-value">
                                    {formatTime(timeSpent[currentQuestionIndex] || 0)}
                                </span>
                                <button 
                                    className="zoom-btn" 
                                    onClick={() => setIsPaused(true)} 
                                    style={{ padding: '0.3rem', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', border: 'none', cursor: 'pointer', color: 'white' }}
                                    title="Pause Test"
                                >
                                    <Pause size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="te-avatars">
                        {isMultiplayer ? (
                            room.participants?.map((p, idx) => (
                                <div className="te-avatar" key={idx} title={p.name}>
                                    <div className="avatar-placeholder">{p.name?.[0]?.toUpperCase() || 'P'}</div>
                                </div>
                            ))
                        ) : (
                            <div className="te-avatar">
                                <div className="avatar-placeholder">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Sub Top Bar */}
            <div className="te-sub-header">
                <div className="te-sub-links">
                    <span>SYMBOLS</span>
                    <span>INSTRUCTIONS</span>
                    <span>OVERALL TEST SUMMARY</span>
                </div>
                <div className="te-total-answered">
                    Total Questions Answered: <span className="badge-yellow">{getAnsweredCount()}</span>
                </div>
            </div>

            {/* Action Bar */}
            <div className="te-action-bar">
                <div className="te-section-tabs">
                    <div className="te-tab active">PART-A</div>
                    {/* Add more tabs if multipart exists in data */}
                </div>
                <div className="te-buttons">
                    {isFriendly ? (
                        <>
                            {/* Friendly Mode Actions */}
                            {friendlyAnswered ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
                                    ✓ Response submitted. Waiting for others...
                                </span>
                            ) : (
                                <>
                                    {isAnswered ? (
                                        <>
                                            <button 
                                                className="te-btn" 
                                                onClick={() => {
                                                    const newReview = new Set(markedForReview || []);
                                                    if (newReview.has(currentQuestionIndex)) {
                                                        newReview.delete(currentQuestionIndex);
                                                    } else {
                                                        newReview.add(currentQuestionIndex);
                                                    }
                                                    updateExamState({ markedForReview: Array.from(newReview) });
                                                }}
                                            >
                                                {markedForReview && markedForReview.includes(currentQuestionIndex) ? 'Unmark' : 'Mark for Review'}
                                            </button>
                                            <button className="te-btn submit" onClick={handleSaveAnswer}>
                                                Submit Answer
                                            </button>
                                        </>
                                    ) : (
                                        <button className="te-btn" onClick={handleIndividualSkip}>
                                            Skip
                                        </button>
                                    )}
                                </>
                            )}

                            {room.isHost && (
                                <>
                                    <button className="te-btn" style={{ background: 'var(--c-accent2)', color: 'var(--text-dark)' }} onClick={handleSkipForAll}>Skip for All</button>
                                    <button className="te-btn" style={{ background: 'var(--c-primary)', color: '#2C2F40' }} onClick={handleForceReveal}>Force Reveal</button>
                                    {(friendlyRevealed || (friendlyAnswered && currentQuestionIndex === roomActiveQuestionIndex)) && !isLastQuestion && (
                                        <button className="te-btn submit" onClick={handleNextFriendly}>Next Question</button>
                                    )}
                                    {isLastQuestion && <button className="te-btn submit" onClick={handleFinishFriendly}>Finish Test</button>}
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Normal Mode Actions */}
                            <button className="te-btn" onClick={handleReviewAndNext}>Mark for Review</button>

                            <button className="te-btn" onClick={handleNext}>Save & Next</button>

                            <button className="te-btn submit" onClick={() => setConfirmSubmit(true)}>Submit Test</button>
                        </>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="te-main-area">
                
                {/* Left Pane (Question) */}
                <div className="te-left-pane">
                    <div className="te-question-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span className="te-question-no">Question No. {currentQuestionIndex + 1}</span>
                            {/* Finish Test Controls */}
                            {isMultiplayer && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        className="te-btn submit" 
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                                        onClick={() => handleSubmit(false)}
                                    >
                                        Finish Individual Test
                                    </button>
                                    {room.isHost && (
                                        <button 
                                            className="te-btn save" 
                                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', background: '#c0392b' }}
                                            onClick={() => {
                                                if (window.confirm("Are you sure you want to finish the test for ALL participants?")) {
                                                    room.socket?.emit('forceSubmitAll', { code: roomCode });
                                                }
                                            }}
                                        >
                                            Finish Test For All
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <span style={{ fontSize: '0.8rem', marginRight: '1rem' }}>Select Language <select><option>English</option></select></span>
                            <span style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-muted)' }}>⚠️ Report</span>
                        </div>
                    </div>
                    
                    <div className="te-question-content">
                        {currentQuestion ? (
                            <>
                                <div style={{ marginBottom: '1rem', fontSize: '1.1rem' }} className="markdown-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{preprocessLaTeX(currentQuestion.question_text || currentQuestion.text)}</ReactMarkdown>
                                </div>
                                {isSeatingArrangement(currentQuestion, testFormat) ? (
                                    renderSeatingArrangement(currentQuestion)
                                ) : (
                                    <div className="te-options-list">
                                        {currentQuestion.options?.map((opt, idx) => {
                                            let optionClass = `te-option-item ${answers[currentQuestionIndex] === idx ? 'selected' : ''}`;
                                            if (isFriendly && isQuestionRevealed && questionRevealData) {
                                                const isCorrectAns = idx === currentQuestion.correctAnswer;
                                                const isUserChoice = idx === answers[currentQuestionIndex];
                                                if (isCorrectAns) {
                                                    optionClass += ' reveal-correct';
                                                } else if (isUserChoice) {
                                                    optionClass += ' reveal-incorrect';
                                                }
                                            }
                                            return (
                                                <label key={idx} className={optionClass}>
                                                    <input 
                                                        type="radio" 
                                                        name="q-option" 
                                                        className="te-option-radio"
                                                        checked={answers[currentQuestionIndex] === idx}
                                                        onClick={() => handleOptionSelect(idx)}
                                                        onChange={() => {}} /* Prevent React warning, handled by onClick */
                                                        disabled={isFriendly && (currentQuestionIndex < roomActiveQuestionIndex || friendlyAnswered || friendlyRevealed)}
                                                    />
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{preprocessLaTeX(opt)}</ReactMarkdown>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p>Loading question...</p>
                        )}

                        {/* Show Answers if revealed in Friendly Mode */}
                        {isFriendly && isQuestionRevealed && questionRevealData && (
                            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--c-accent1)', borderRadius: '4px' }}>
                                <h4>Correct Answer: Option {currentQuestion.correctAnswer + 1}</h4>
                                {currentQuestion.explanation && <p>{currentQuestion.explanation}</p>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Pane (Palette) */}
                <div className={`te-right-pane ${isPaletteCollapsed ? 'collapsed' : ''}`}>
                    <div className="te-right-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{!isPaletteCollapsed && '▶ Test / Status'}</span>
                        <button className="collapse-btn" onClick={() => setIsPaletteCollapsed(!isPaletteCollapsed)} title="Toggle Panel">
                            {isPaletteCollapsed ? <List size={18} /> : <ChevronRight size={18} />}
                        </button>
                    </div>
                    
                    {!isPaletteCollapsed && (
                        <>
                            {isFriendly && (
                                <div className="te-tabs">
                                    <button className={`te-tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>Status</button>
                                    <button className={`te-tab ${activeTab === 'palette' ? 'active' : ''}`} onClick={() => setActiveTab('palette')}>Grid</button>
                                </div>
                            )}

                            {(activeTab === 'palette' || !isFriendly) && (
                                <>
                                    <div className="te-grid-container">
                        <div className="te-question-grid">
                            {questions.map((_, idx) => (
                                <button 
                                    key={idx}
                                    className={`te-grid-btn status-${getGridStatus(idx)} ${isFriendly && idx > roomActiveQuestionIndex ? 'locked' : ''}`}
                                    onClick={() => {
                                        if (isFriendly && idx > roomActiveQuestionIndex) return;
                                        updateExamState({ currentQuestionIndex: idx });
                                    }}
                                >
                                    {idx + 1}
                                    {/* Show friends avatars who answered this in friendly mode */}
                                    {isFriendly && room.participants?.filter(p => !p.isConductor)?.map(p => {
                                        if (hasPlayerAnsweredQuestion(p.name, idx)) {
                                            return <div key={p.id} className="friend-badge-te" title={`${p.name} answered`}>{(p.name?.[0] || 'P').toUpperCase()}</div>;
                                        }
                                        return null;
                                    })}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Analysis Table */}
                    <div className="te-analysis-table">
                        <table>
                            <thead>
                                <tr>
                                    <th colSpan="2">PART-A Analysis</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Answered</td>
                                    <td className="count-badge">{getAnsweredCount()}</td>
                                </tr>
                                <tr>
                                    <td>Not Answered</td>
                                    <td className="count-badge" style={{color:'red'}}>{getNotAnsweredCount()}</td>
                                </tr>
                                <tr>
                                    <td>Mark for Review</td>
                                    <td className="count-badge">{getMarkedCount()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {isFriendly && activeTab === 'players' && (
                <div className="te-status-panel" style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-dark)' }}>Live Room Status</h4>
                    {(room.participants || []).filter(p => !p.isConductor).map(p => {
                        const isAnswered = hasPlayerAnsweredQuestion(p.name, currentQuestionIndex);
                        const playerChoiceData = friendlyRevealData?.playerChoices?.[p.name] || (isQuestionRevealed && friendlyReveals[currentQuestionIndex]?.playerChoices?.[p.name]);
                        
                        return (
                            <div key={p.id} className="player-status-card" style={{
                                padding: '0.75rem', 
                                marginBottom: '0.5rem', 
                                borderRadius: '6px', 
                                background: 'white',
                                border: `1px solid ${playerChoiceData ? (playerChoiceData.isCorrect ? 'var(--c-accent1)' : 'var(--status-not-answered)') : (isAnswered ? 'lightpink' : 'var(--border-color)')}`,
                                boxShadow: (!playerChoiceData && isAnswered) ? 'inset 0 0 10px lightpink' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold' }}>
                                        {p.name}
                                        {activeEmotes.find(e => e.sender === p.name) && (
                                            <span style={{ marginLeft: '8px', verticalAlign: 'middle', display: 'inline-flex' }} className="animate-bounce">
                                                <EmoteIcon emoteKey={activeEmotes.slice().reverse().find(e => e.sender === p.name).emoteKey} size={16} />
                                            </span>
                                        )}
                                    </span>
                                    {playerChoiceData ? (
                                        <span style={{ fontSize: '0.8rem', color: playerChoiceData.isCorrect ? 'var(--status-answered)' : 'var(--status-not-answered)', fontWeight: 'bold' }}>
                                            {playerChoiceData.isCorrect ? 'Correct' : 'Incorrect'} 
                                            {playerChoiceData.choice !== -1 ? ` (Option ${String.fromCharCode(65 + playerChoiceData.choice)})` : ' (Skipped)'}
                                        </span>
                                    ) : isAnswered ? (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Locked In</span>
                                    ) : (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Thinking...</span>
                                    )}
                                </div>
                                
                                {playerChoiceData && (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Selected: Option {playerChoiceData.choice + 1}
                                    </div>
                                )}
                                
                                {(isAnswered || playerChoiceData) && (
                                    <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                        Time taken: {playerChoiceData ? playerChoiceData.timeSpentSec : friendlyAnswerStatus.answeredPlayers?.find(ap => ap.name === p.name)?.timeSpentSec || 0}s
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    )}
</div>

</div>

            {/* Chat FAB & Drawer - Replaced with FriendlyChat */}
            {isMultiplayer && room.socket && (
                <FriendlyChat 
                    socket={room.socket} 
                    roomCode={roomCode} 
                    displayName={user?.name}
                    inline={false}
                />
            )}

            {/* Confirm Submit Modal */}
            {confirmSubmit && (
                <div className="pause-overlay">
                    <div className="pause-modal glass" style={{ textAlign: 'center' }}>
                        <h2 style={{color: '#e74c3c'}}>Submit Test?</h2>
                        <p>Are you sure you want to submit? You cannot return to the test.</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                            <Button variant="ghost" onClick={() => setConfirmSubmit(false)}>Cancel</Button>
                            <Button variant="danger" onClick={handleFinalSubmit}>Yes, Submit Test</Button>
                        </div>
                    </div>
                </div>
            )}
            
            {isPaused && (
                <div className="pause-overlay animate-fade-in" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: 'rgba(15, 23, 42, 0.98)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', padding: '2rem'
                }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Pause size={28} /> Test Paused
                    </h2>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '2rem', borderRadius: '12px', minWidth: '500px' }}>
                        <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem', color: '#94a3b8' }}>
                            Current Progress Stats
                        </h3>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1' }}>Subject</th>
                                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1' }}>Attempted / Total</th>
                                    {isMultiplayer && <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1' }}>Correct</th>}
                                    {isMultiplayer && <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1' }}>Wrong</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(getPauseStats()).map(([subject, data]) => (
                                    <tr key={subject} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.75rem', fontWeight: 500 }}>{subject}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{ color: '#60a5fa' }}>{data.attempted}</span> <span style={{ color: '#64748b' }}>/ {data.total}</span>
                                        </td>
                                        {isMultiplayer && <td style={{ padding: '0.75rem', color: '#4ade80' }}>{data.correct}</td>}
                                        {isMultiplayer && <td style={{ padding: '0.75rem', color: '#f87171' }}>{data.incorrect}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Button variant="primary" style={{ marginTop: '2rem', padding: '0.75rem 2rem', fontSize: '1.1rem' }} onClick={() => setIsPaused(false)}>
                        <Play size={20} style={{ marginRight: '0.5rem' }} /> Resume Test
                    </Button>
                </div>
            )}
        </div>
    );
};

const Test = () => (
    <TestErrorBoundary>
        <TestInner />
    </TestErrorBoundary>
);

export default Test;
