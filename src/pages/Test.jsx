import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import { saveExam } from '../utils/storage';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, List, Play, Pause, SaveAll, Bookmark, Save, Users, MessageSquare, Send } from 'lucide-react';
import BadgeIcon from '../components/BadgeSVGs';
import UserProfileModal from '../components/UserProfileModal';
import QuestionRenderer from '../components/QuestionRenderer';
import './Test.css';

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

const Test = () => {
    const { 
        examType, testFormat, questions, testStarted, currentQuestionIndex, updateExamState, 
        answers, markedForReview, timeSpent, timeLeft: savedTimeLeft, isMultiplayer, roomCode, _saveId,
        initialFriendlyRevealData, initialFriendlyAnswerStatus, markingScheme
    } = useExam();
    const { authFetch } = useAuth();
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
    const [showPalette, setShowPalette] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [saveToast, setSaveToast] = useState(false);
    const autoSaveRef = useRef(null);

    // Speed Demon Badge tracking refs & state
    const speedDemonStreakRef = useRef(0);
    const answeredCorrectlyInStreakRef = useRef(new Set());
    const speedDemonAwardedRef = useRef(false);
    const [showSpeedDemonAlert, setShowSpeedDemonAlert] = useState(false);

    const triggerSpeedDemonUnlock = () => {
        speedDemonAwardedRef.current = true;
        setShowSpeedDemonAlert(true);
        setTimeout(() => setShowSpeedDemonAlert(false), 5000);

        authFetch('/api/gamification/unlock-badge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ badgeKey: 'speed_demon' })
        })
        .then(r => r.json())
        .then(data => {
            console.log("Speed Demon badge unlocked:", data);
        })
        .catch(err => console.error("Error unlocking Speed Demon badge:", err));
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

    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        if (!room.socket) return;
        const onChatMessage = (msg) => {
            setMessages(prev => [...prev, msg]);
            if (activeTabRef.current !== 'chat') {
                setUnreadChat(true);
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
                localStorage.removeItem(`testara_mp_state_${roomCode}`);
                room.submitResults({
                    answers,
                    timeSpent,
                    score,
                    total: questions.length,
                    correct,
                    incorrect,
                    markingScheme,
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

    useEffect(() => {
        if (!testStarted || questions.length === 0) {
            navigate('/');
        }
    }, [testStarted, questions, navigate]);

    // Main timer (only for exam mode or solo)
    useEffect(() => {
        let timer;
        if (!isPaused && testStarted && questions.length > 0 && !isFriendly && hasReadInstructions) {
            timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        handleSubmit(true);
                        return 0;
                    }
                    return prev - 1;
                });

                updateExamState({
                    timeSpent: Object.assign([], timeSpent, {
                        [currentQuestionIndex]: (timeSpent[currentQuestionIndex] || 0) + 1
                    })
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isPaused, testStarted, questions, currentQuestionIndex, timeSpent, updateExamState, isFriendly, hasReadInstructions]);

    // Friendly mode question timer
    useEffect(() => {
        let timer;
        if (isFriendly && testStarted && questions.length > 0 && !friendlyAnswered && !friendlyRevealed && currentQuestionIndex === roomActiveQuestionIndex && hasReadInstructions) {
            timer = setInterval(() => {
                updateExamState({
                    timeSpent: Object.assign([], timeSpent, {
                        [currentQuestionIndex]: (timeSpent[currentQuestionIndex] || 0) + 1
                    })
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isFriendly, testStarted, questions, currentQuestionIndex, roomActiveQuestionIndex, friendlyAnswered, friendlyRevealed, timeSpent, updateExamState, hasReadInstructions]);

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

    // Sync multiplayer state to localStorage
    useEffect(() => {
        if (isMultiplayer && testStarted && roomCode) {
            localStorage.setItem(`testara_mp_state_${roomCode}`, JSON.stringify({
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
        }
    }, [isMultiplayer, testStarted, roomCode, answers, timeSpent, currentQuestionIndex, questions, examType, testFormat, room.playerName, room.roomMode]);

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
            const activePlayers = room.participants.filter(p => !p.isConductor);
            const totalPlayersCount = activePlayers.length;
            const submittedCount = room.results.length;
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

        const onForceSubmit = () => {
            handleSubmit(true);
        };

        room.socket.on('friendlyAnswerStatus', onAnswerStatus);
        room.socket.on('friendlyReveal', onReveal);
        room.socket.on('friendlyNextQuestion', onNextQuestion);
        room.socket.on('friendlyForceSubmit', onForceSubmit);

        return () => {
            room.socket.off('friendlyAnswerStatus', onAnswerStatus);
            room.socket.off('friendlyReveal', onReveal);
            room.socket.off('friendlyNextQuestion', onNextQuestion);
            room.socket.off('friendlyForceSubmit', onForceSubmit);
        };
    }, [isFriendly, room.socket, updateExamState]);

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

        const newAnswers = { ...answers, [currentQuestionIndex]: optionIndex };
        updateExamState({ answers: newAnswers });

        // Speed Demon tracking for Solo and Exam modes
        if (!isFriendly && !speedDemonAwardedRef.current) {
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
        if (isFriendly && !speedDemonAwardedRef.current) {
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
            setShowPalette(false);
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
        const activePlayers = room.participants.filter(p => !p.isConductor);
        const totalPlayersCount = activePlayers.length;
        const submittedCount = room.results.length;
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
                                                currentQuestionIndex < questions.length - 1 ? (
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
                                                    const result = room.results.find(r => r.playerName === p.name || (p.email && r.email === p.email));
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
                                <div className="test-chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {messages.length === 0 ? (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', marginTop: '2rem', fontStyle: 'italic' }}>
                                            No messages yet.
                                        </div>
                                    ) : (
                                        messages.map((msg, i) => {
                                            const isSelf = msg.sender === room.playerName;
                                            return (
                                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isSelf ? 'flex-end' : 'flex-start', maxWidth: '100%', wordBreak: 'break-word' }}>
                                                    <span 
                                                         style={{ 
                                                             fontSize: '0.65rem', 
                                                             color: isSelf ? 'var(--primary)' : 'var(--text-secondary)', 
                                                             fontWeight: '600', 
                                                             marginBottom: '0.15rem',
                                                             cursor: 'pointer',
                                                             textDecoration: 'underline'
                                                         }}
                                                         onClick={() => setActiveProfileQuery({ name: msg.sender, email: msg.email })}
                                                         title={`Click to view ${msg.sender}'s profile`}
                                                     >
                                                         {msg.sender}
                                                     </span>
                                                    <div style={{ fontSize: '0.75rem', color: 'white', background: isSelf ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)', border: isSelf ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255,255,255,0.08)', padding: '0.4rem 0.6rem', borderRadius: '8px', maxWidth: '90%' }}>
                                                        <p style={{ margin: 0 }}>{msg.text}</p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="test-chat-input" style={{ display: 'flex', padding: '0.5rem', borderTop: '1px solid var(--card-border)' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Type message..." 
                                        value={chatInput} 
                                        onChange={(e) => setChatInput(e.target.value)} 
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                        style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--card-border)', color: 'white', padding: '0.4rem', borderRadius: '4px', fontSize: '0.8rem', outline: 'none' }}
                                    />
                                    <button onClick={handleSendChat} style={{ background: 'var(--primary)', border: 'none', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '4px', marginLeft: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Send size={12} />
                                    </button>
                                </div>
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

    if (isConductor) {
        return renderConductorDashboard();
    }

    if (!testStarted || !currentQuestion) return null;

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

    return (
        <div className="test-layout">
            {/* Save Toast */}
            {saveToast && (
                <div className="save-toast animate-fade-in">
                    <CheckCircle size={18} /> Progress saved! Redirecting...
                </div>
            )}

            {/* Speed Demon In-Test Alert */}
            {showSpeedDemonAlert && (
                <div className="speed-demon-alert-toast">
                    <div className="speed-demon-alert-content">
                        <BadgeIcon badgeKey="speed_demon" size={42} animated={true} />
                        <div className="speed-demon-text-wrap">
                            <span className="sd-alert-title">🏆 Badge Unlocked!</span>
                            <span className="sd-alert-badge-name">Speed Demon</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Header */}
            <header className="test-header glass">
                <div className="exam-info">
                    <h2>{examType.toUpperCase()} Mock Test</h2>
                    <span className="format-badge">{testFormat.replace('-', ' ')}</span>
                    {isFriendly && <span className="format-badge friendly-badge">🎉 Friendly</span>}
                    {isExamMode && <span className="format-badge multiplayer-badge">📝 Exam</span>}
                    {isMultiplayer && <span className="format-badge multiplayer-badge">🏠 {roomCode}</span>}
                </div>

                <div className="header-controls">
                    {!isFriendly && (
                        <button
                            className="btn btn-ghost btn-sm pause-btn"
                            onClick={() => setIsPaused(!isPaused)}
                            title={isPaused ? "Resume Test" : "Pause Test"}
                        >
                            {isPaused ? <Play size={20} /> : <Pause size={20} />}
                        </button>
                    )}

                    {!isFriendly && (
                        <div className={`timer-container ${!isPaused && timeLeft < 300 ? 'animate-pulse text-danger' : ''}`}>
                            <Clock size={20} className="timer-icon" />
                            <span className="time-left">{formatTime(timeLeft)}</span>
                        </div>
                    )}

                    {isFriendly && (
                        <div className="friendly-progress-badge">
                            <Users size={16} />
                            <span>Q{currentQuestionIndex + 1}/{questions.length}</span>
                        </div>
                    )}

                    <button
                        className="mobile-palette-toggle btn btn-ghost btn-sm"
                        onClick={() => setShowPalette(!showPalette)}
                    >
                        <List size={20} />
                    </button>
                </div>
            </header>

            <div className={`test-content ${isPaused ? 'paused' : ''}`}>
                {/* Blur Overlay when Paused */}
                {isPaused && (
                    <div className="pause-overlay">
                        <div className="pause-modal glass">
                            <Pause size={48} className="pause-icon" />
                            <h2>Test Paused</h2>
                            <p>Your timer is stopped and the screen is hidden.</p>
                            <Button variant="primary" onClick={() => setIsPaused(false)}>Resume Test</Button>
                        </div>
                    </div>
                )}

                {/* Main Question Area */}
                <main className="question-area">
                    <Card className="question-card animate-fade-in" key={currentQuestionIndex}>
                        <div className="question-meta">
                            <span className="q-number">Question {currentQuestionIndex + 1} of {questions.length}</span>
                            {isFriendly && currentQuestionIndex < roomActiveQuestionIndex && (
                                <button 
                                    className="btn btn-ghost btn-xs go-to-live-btn"
                                    onClick={() => updateExamState({ currentQuestionIndex: roomActiveQuestionIndex })}
                                >
                                    ⚡ Back to Live (Q{roomActiveQuestionIndex + 1})
                                </button>
                            )}
                            {!isFriendly && (
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <span className="q-tag" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Clock size={14} /> {formatTime(timeSpent[currentQuestionIndex] || 0)}
                                    </span>
                                    {currentQuestion.subject && <span className="q-tag">{currentQuestion.subject}</span>}
                                </div>
                            )}
                            {isFriendly && (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {currentQuestion.subject && <span className="q-tag">{currentQuestion.subject}</span>}
                                    <span className="q-tag timer-tag" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        ⏱️ {timeSpent[currentQuestionIndex] || 0}s
                                    </span>
                                </div>
                            )}
                        </div>

                        {isSeatingArrangement(currentQuestion, testFormat) && (
                            <div className="seating-arrangement-badge" style={{ marginBottom: '1rem' }}>
                                {getSeatingArrangementType(currentQuestion) === 'circular' && (
                                    <span className="seating-badge circular">🔄 Circular Seating Arrangement ({getMembersCount(currentQuestion)} Members)</span>
                                )}
                                {getSeatingArrangementType(currentQuestion) === 'parallel' && (
                                    <span className="seating-badge parallel">⇄ Parallel Seating Arrangement ({getMembersCount(currentQuestion)} Members)</span>
                                )}
                                {getSeatingArrangementType(currentQuestion) === 'linear' && (
                                    <span className="seating-badge linear">📏 Linear Seating Arrangement ({getMembersCount(currentQuestion)} Members)</span>
                                )}
                            </div>
                        )}

                        <div className="question-text">
                            <QuestionRenderer text={currentQuestion.text} subject={currentQuestion.subject} />
                        </div>

                        {isSeatingArrangement(currentQuestion, testFormat) ? (
                            renderSeatingArrangement(currentQuestion)
                        ) : (
                            <div className="options-list">
                                {currentQuestion.options.map((option, idx) => (
                                    <button
                                        key={idx}
                                        className={getOptionClass(idx)}
                                        onClick={() => handleOptionSelect(idx)}
                                        disabled={isFriendly && (currentQuestionIndex < roomActiveQuestionIndex || friendlyAnswered || friendlyRevealed)}
                                    >
                                        <div className="option-marker">
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <div className="option-content">{option}</div>
                                        {/* Normal selected check */}
                                        {!isQuestionRevealed && answers[currentQuestionIndex] === idx && (
                                            <CheckCircle className="option-check" style={{ color: 'var(--primary)' }} size={20} />
                                        )}
                                        {/* Friendly reveal: correct */}
                                        {isQuestionRevealed && idx === questionRevealData?.correctAnswer && (
                                            <CheckCircle className="option-check success-icon" size={20} />
                                        )}
                                        {/* Friendly reveal: my wrong pick */}
                                        {isQuestionRevealed && answers[currentQuestionIndex] === idx && idx !== questionRevealData?.correctAnswer && (
                                            <XCircle className="option-check danger-icon" size={20} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Friendly Mode Actions (Save & Skip) */}
                        {isFriendly && currentQuestionIndex === roomActiveQuestionIndex && !friendlyAnswered && !friendlyRevealed && (
                            <div className="friendly-actions-container animate-fade-in" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                {(answers[currentQuestionIndex] !== undefined && answers[currentQuestionIndex].toString().trim() !== '') && (
                                    <Button variant="primary" onClick={handleSaveAnswer} style={{ minWidth: '150px' }}>
                                        🔒 Save Answer
                                    </Button>
                                )}
                                <Button variant="outline" onClick={handleIndividualSkip} style={{ minWidth: '150px' }}>
                                    ⏩ Skip Question
                                </Button>
                            </div>
                        )}

                        {/* Friendly Mode: Waiting / Reveal Section */}
                        {isFriendly && (
                            <div className="friendly-section">
                                {currentQuestionIndex === roomActiveQuestionIndex && friendlyWaiting && !friendlyRevealed && (
                                    <div className="friendly-waiting glass">
                                        <div className="waiting-spinner"></div>
                                        <p>Waiting for others... ({friendlyAnswerStatus.answeredCount}/{friendlyAnswerStatus.totalParticipants})</p>
                                        <div className="answered-avatars">
                                            {friendlyAnswerStatus.answeredPlayers?.map((player, i) => (
                                                <span key={i} className="avatar-chip">✅ {player.name} ({player.timeSpentSec}s)</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {currentQuestionIndex === roomActiveQuestionIndex && !friendlyAnswered && !friendlyRevealed && (
                                    <div className="friendly-prompt">
                                        <p>👆 Pick an answer — click lock/save when you are done!</p>
                                    </div>
                                )}

                                {isQuestionRevealed && questionRevealData && (
                                    <div className="friendly-reveal-card glass animate-fade-in">
                                        <h4>📊 Everyone's Answers</h4>
                                        <div className="reveal-players">
                                            {Object.entries(questionRevealData.playerChoices).map(([name, data]) => (
                                                <div key={name} className={`reveal-player ${data.choice === -1 ? 'skipped' : (data.isCorrect ? 'correct' : 'incorrect')}`}>
                                                    <span className="reveal-icon">{data.choice === -1 ? '⏭️' : (data.isCorrect ? '✅' : '❌')}</span>
                                                    <span className="reveal-name">{name}</span>
                                                    <span className="reveal-choice">
                                                        {data.choice === -1 ? 'Skipped' : `picked ${String.fromCharCode(65 + data.choice)}`} ({data.timeSpentSec}s)
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="reveal-explanation">
                                            <strong>Explanation:</strong> {currentQuestion.explanation}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="test-actions">
                            <Button
                                variant="outline"
                                onClick={handlePrev}
                                disabled={currentQuestionIndex === 0}
                            >
                                <ChevronLeft size={20} /> Previous
                            </Button>

                            {!isFriendly && (
                                <Button
                                    variant={markedForReview?.includes(currentQuestionIndex) ? 'solid' : 'outline'}
                                    onClick={handleReviewAndNext}
                                    className={markedForReview?.includes(currentQuestionIndex) ? 'bg-amber-600' : ''}
                                >
                                    <Bookmark size={20} /> {markedForReview?.includes(currentQuestionIndex) ? 'Unmark' : 'Mark Review'}
                                </Button>
                            )}

                            <div className="right-actions">
                                {isFriendly ? (
                                    <>
                                        {currentQuestionIndex < roomActiveQuestionIndex ? (
                                            <Button variant="primary" onClick={() => {
                                                updateExamState({ currentQuestionIndex: currentQuestionIndex + 1 });
                                            }}>
                                                Next Question <ChevronRight size={20} />
                                            </Button>
                                        ) : (
                                            <>
                                                {!friendlyRevealed && (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        {room.isHost && (
                                                            <>
                                                                <Button variant="outline" onClick={() => {
                                                                    if (window.confirm("Force reveal the answer to all players?")) {
                                                                        room.socket?.emit('friendlyForceReveal', { code: roomCode }, () => {});
                                                                    }
                                                                }}>
                                                                    Force Reveal
                                                                </Button>
                                                                {!isLastQuestion && (
                                                                    <Button variant="outline" onClick={() => {
                                                                        if (window.confirm("Skip this question for all players?")) {
                                                                            room.socket?.emit('friendlyNext', { code: roomCode }, () => {});
                                                                        }
                                                                    }}>
                                                                        Skip for All
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                {friendlyRevealed && (
                                                    <>
                                                        {isLastQuestion ? (
                                                            <Button variant="primary" onClick={() => handleSubmit()}>
                                                                Finish & See Results
                                                            </Button>
                                                        ) : (
                                                            room.isHost ? (
                                                                <Button variant="primary" onClick={handleNext}>
                                                                    Next Question <ChevronRight size={20} />
                                                                </Button>
                                                            ) : (
                                                                <div className="friendly-waiting-next glass" style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                                    ⏳ Waiting for host to advance...
                                                                </div>
                                                            )
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {isLastQuestion ? (
                                            <Button variant="primary" onClick={() => handleSubmit()}>
                                                Submit Test
                                            </Button>
                                        ) : (
                                            <Button variant="primary" onClick={handleNext}>
                                                Next <ChevronRight size={20} />
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </Card>
                </main>

                {/* Sidebar / Question Palette */}
                <aside className={`palette-sidebar glass ${showPalette ? 'show' : ''}`}>
                    <div className="palette-header">
                        <h3>Question Palette</h3>
                        <div className="palette-stats">
                            <div className="stat">
                                <span className="dot answered"></span> {Object.values(answers).filter(val => val !== undefined && val !== -1).length} Answered
                            </div>
                            <div className="stat">
                                <span className="dot unattempted"></span> {questions.length - Object.values(answers).filter(val => val !== undefined && val !== -1).length} Unattempted
                            </div>
                        </div>
                        {!isFriendly && (
                            <div className="palette-stats" style={{ marginTop: '0.5rem' }}>
                                <div className="stat">
                                    <span className="dot" style={{ backgroundColor: '#f59e0b' }}></span> {markedForReview?.length || 0} Review
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="palette-grid">
                        {questions.map((_, idx) => {
                            let friendlyClass = '';
                            if (isFriendly) {
                                const reveal = friendlyReveals[idx] || (idx === roomActiveQuestionIndex ? friendlyRevealData : null);
                                if (reveal && reveal.playerChoices && reveal.playerChoices[room.playerName]) {
                                    const choiceData = reveal.playerChoices[room.playerName];
                                    if (choiceData.choice === -1) {
                                        friendlyClass = 'friendly-skipped';
                                    } else if (choiceData.isCorrect) {
                                        friendlyClass = 'friendly-correct';
                                    } else {
                                        friendlyClass = 'friendly-incorrect';
                                    }
                                }
                            }

                            return (
                                <button
                                    key={idx}
                                    className={`palette-btn 
                      ${currentQuestionIndex === idx ? 'current' : ''} 
                      ${(answers[idx] !== undefined && answers[idx] !== -1 && answers[idx].toString().trim() !== '') ? 'answered' : ''}
                      ${markedForReview?.includes(idx) ? 'review' : ''}
                      ${friendlyClass}
                    `}
                                    onClick={() => jumpToQuestion(idx)}
                                    disabled={isFriendly && idx > roomActiveQuestionIndex}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>

                    <div className="palette-footer">
                        {!isMultiplayer && (
                            <Button variant="outline" className="w-full save-exit-btn" onClick={handleSaveAndExit}>
                                <Save size={16} style={{ marginRight: '0.5rem' }} /> Save & Exit
                            </Button>
                        )}
                        {!isFriendly && (
                            <Button variant="outline" className="w-full partial-submit-btn" onClick={handlePartialSubmit} style={{ marginTop: '0.75rem' }}>
                                <SaveAll size={16} style={{ marginRight: '0.5rem' }} /> Progress Check
                            </Button>
                        )}
                        {isFriendly && room.isHost ? (
                            <Button variant="primary" className="w-full finish-all-btn" onClick={() => {
                                if (window.confirm('This will submit the exam for ALL participants. Continue?')) {
                                    room.socket?.emit('friendlyFinish', { code: roomCode }, () => { });
                                }
                            }} style={{ marginTop: '0.75rem' }}>
                                🚨 Finish Exam for All
                            </Button>
                        ) : (
                            <Button variant="primary" className="w-full" onClick={() => handleSubmit()} style={{ marginTop: '0.75rem' }}>
                                {isFriendly ? 'Finish Test' : 'Submit Final Test'}
                            </Button>
                        )}
                    </div>
                </aside>

                {/* Multiplayer Player Answer Status Sidebar Panel */}
                {isMultiplayer && (
                    <aside className="mp-player-panel glass">
                        {/* Tab Headers */}
                        {room.enableChat !== false && room.socket ? (
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
                        ) : (
                            <div className="mp-panel-header">
                                <h4><Users size={16} /> Players — Q{currentQuestionIndex + 1}</h4>
                            </div>
                        )}

                        {activeTab === 'players' ? (
                            <div className="mp-player-list">
                                {isFriendly && room.participants?.map((p, idx) => {
                                    const isCurrentActive = currentQuestionIndex === roomActiveQuestionIndex;
                                    const answeredPlayer = isCurrentActive && friendlyAnswerStatus.answeredPlayers?.find(ap => ap.name === p.name);
                                    const hasAnswered = !!answeredPlayer;
                                    const answerTime = answeredPlayer ? answeredPlayer.timeSpentSec : null;
                                    const revealData = questionRevealData?.playerChoices?.[p.name];
                                    return (
                                        <div 
                                            key={idx} 
                                            className={`mp-player-row ${revealData ? (revealData.choice === -1 ? 'skipped' : (revealData.isCorrect ? 'correct' : 'incorrect')) : ''}`}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setActiveProfileQuery({ email: p.email, name: p.name })}
                                            title={`Click to view ${p.name}'s profile & exams`}
                                        >
                                            <span className="mp-player-name" style={{ textDecoration: 'underline' }}>{p.isHost ? '👑 ' : ''}{p.name}</span>
                                            <span className="mp-player-status">
                                                {revealData ?
                                                    <>{revealData.choice === -1 ? '⏭️ Skipped' : `${revealData.isCorrect ? '✅' : '❌'} ${String.fromCharCode(65 + revealData.choice)}`} ({revealData.timeSpentSec}s)</>
                                                    : hasAnswered ? <span className="answered-dot">✅ ({answerTime}s)</span> : <span className="waiting-dot">⏳</span>
                                                }
                                            </span>
                                        </div>
                                    );
                                })}
                                {isExamMode && (() => {
                                    const examPlayers = (room.participants || []).filter(p => !p.isConductor);
                                    const sortedPlayers = [...examPlayers].sort((a, b) => {
                                        return (b.liveScore || 0) - (a.liveScore || 0) || (b.answeredCount || 0) - (a.answeredCount || 0);
                                    });
                                    const maxScore = sortedPlayers.length > 0 ? (sortedPlayers[0].liveScore || 0) : 0;

                                    return sortedPlayers.map((p, idx) => {
                                        const isFirst = maxScore > 0 && (p.liveScore || 0) === maxScore;
                                        return (
                                            <div 
                                                key={idx} 
                                                className={`mp-player-row ${isFirst ? 'leader-row' : ''}`}
                                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem' }}
                                                onClick={() => setActiveProfileQuery({ email: p.email, name: p.name })}
                                                title={`Click to view ${p.name}'s profile & exams`}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', flex: 1 }}>
                                                    {isFirst ? (
                                                        <Crown size={16} className="text-amber leader-crown-anim" style={{ flexShrink: 0 }} />
                                                    ) : p.isHost ? (
                                                        <Crown size={14} className="text-amber-muted" style={{ flexShrink: 0 }} />
                                                    ) : (
                                                        <span className="rank-number" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '20px', display: 'inline-block', flexShrink: 0 }}>#{idx + 1}</span>
                                                    )}
                                                    <span className="mp-player-name" style={{ textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: isFirst ? '700' : '500' }}>
                                                        {p.name}
                                                    </span>
                                                </div>
                                                <span className="mp-player-score-badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: isFirst ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)', color: isFirst ? '#f59e0b' : 'var(--text-secondary)', border: isFirst ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                                                    {p.liveScore || 0} pts ({p.answeredCount || 0} Ans)
                                                </span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        ) : (
                            /* Sidebar Chat view */
                            <div className="test-chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                                <div className="test-chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {messages.length === 0 ? (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', marginTop: '2rem', fontStyle: 'italic' }}>
                                            No messages yet.
                                        </div>
                                    ) : (
                                        messages.map((msg, i) => {
                                            const isSelf = msg.sender === room.playerName;
                                            return (
                                                <div 
                                                    key={i} 
                                                    style={{ 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        alignItems: isSelf ? 'flex-end' : 'flex-start',
                                                        maxWidth: '100%',
                                                        wordBreak: 'break-word'
                                                    }}
                                                >
                                                    <span 
                                                         style={{ 
                                                             fontSize: '0.65rem', 
                                                             color: isSelf ? 'var(--primary)' : 'var(--text-secondary)', 
                                                             fontWeight: '600', 
                                                             textDecoration: 'underline'
                                                         }}
                                                         onClick={() => setActiveProfileQuery({ name: msg.sender, email: msg.email })}
                                                         title={`Click to view ${msg.sender}'s profile`}
                                                     >
                                                         {msg.sender}
                                                     </span>
                                                    <div style={{ 
                                                        fontSize: '0.75rem', 
                                                        color: 'white', 
                                                        background: isSelf ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                                        border: isSelf ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                                                        padding: '0.4rem 0.6rem', 
                                                        borderRadius: '8px',
                                                        maxWidth: '90%'
                                                    }}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="test-chat-input-row" style={{ padding: '0.5rem', borderTop: '1px solid var(--card-border)', display: 'flex', gap: '0.4rem', background: 'rgba(0,0,0,0.1)' }}>
                                    <input
                                        type="text"
                                        placeholder="Type a message..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSendChat();
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '0.4rem 0.6rem',
                                            background: 'rgba(15, 23, 42, 0.6)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '6px',
                                            color: 'white',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                    <button 
                                        onClick={handleSendChat}
                                        style={{
                                            background: 'var(--primary)',
                                            border: 'none',
                                            color: 'white',
                                            padding: '0.4rem 0.6rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <Send size={12} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </aside>
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
};

export default Test;
