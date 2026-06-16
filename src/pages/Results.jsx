import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../context/ExamContext';
import { useRoom } from '../context/RoomContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { CheckCircle, XCircle, ChevronLeft, Award, Clock, Trophy, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import FriendlyChat from '../components/FriendlyChat';
import UserProfileModal from '../components/UserProfileModal';
import QuestionRenderer from '../components/QuestionRenderer';
import BadgeIcon from '../components/BadgeSVGs';
import './Results.css';

// Simple Confetti component
const Confetti = () => {
    const particles = useMemo(() => {
        const list = [];
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
        for (let i = 0; i < 60; i++) {
            list.push({
                id: i,
                left: Math.random() * 100,
                delay: Math.random() * 2,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                duration: Math.random() * 2 + 2,
                rotation: Math.random() * 360
            });
        }
        return list;
    }, []);

    return (
        <div className="confetti-container">
            {particles.map(p => (
                <div 
                    key={p.id} 
                    className="confetti-particle"
                    style={{
                        left: `${p.left}%`,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: p.color,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        transform: `rotate(${p.rotation}deg)`
                    }}
                />
            ))}
        </div>
    );
};

const Results = () => {
    const { questions, answers, resetExam, testStarted, timeSpent, isMultiplayer, roomCode, markingScheme } = useExam();
    const room = useRoom();
    const { authFetch } = useAuth();
    const navigate = useNavigate();
    const historySavedRef = useRef(false);

    // Gamification celebrations states
    const [celebrationBadges, setCelebrationBadges] = useState([]);
    const [levelUpData, setLevelUpData] = useState(null);
    const [activeBadgeIndex, setActiveBadgeIndex] = useState(0);
    const [isCardFlipped, setIsCardFlipped] = useState(false);

    // Reattempt states: { [questionId]: selectedOptionIndex }
    const [reattempts, setReattempts] = useState({});
    const [reattemptMode, setReattemptMode] = useState(false);
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    const ms = useMemo(() => markingScheme || { correct: 2, incorrect: -0.5, unattempted: 0 }, [markingScheme]);

    const formatTime = (seconds) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!testStarted || questions.length === 0) {
            navigate('/');
        }
    }, [testStarted, questions, navigate]);

    // Save to history once
    useEffect(() => {
        if (!testStarted || questions.length === 0) return;
        if (historySavedRef.current) return;
        historySavedRef.current = true;

        // Build topic breakdown
        const topicBreakdown = {};
        questions.forEach((q, idx) => {
            const topic = q.subject || 'General';
            if (!topicBreakdown[topic]) topicBreakdown[topic] = { correct: 0, total: 0 };
            topicBreakdown[topic].total += 1;
            if (answers[idx] !== undefined && answers[idx] === q.correctAnswer) {
                topicBreakdown[topic].correct += 1;
            }
        });

        // Compute local variables for payload
        let localCorrect = 0;
        let localIncorrect = 0;
        let localAttempted = 0;
        Object.keys(answers).forEach((qIndex) => {
            const val = answers[qIndex];
            if (val !== undefined && val !== -1) {
                localAttempted += 1;
                if (val === questions[qIndex].correctAnswer) {
                    localCorrect += 1;
                } else {
                    localIncorrect += 1;
                }
            }
        });
        const localUnattempted = questions.length - localAttempted;
        const localRawScore = localCorrect;
        const localTotalMarks = (localCorrect * ms.correct) + (localIncorrect * ms.incorrect) + (localUnattempted * ms.unattempted);
        const localMaxMarks = questions.length * ms.correct;
        const localPercentage = ((localCorrect / questions.length) * 100).toFixed(1);

        const totalTimeSec = timeSpent.reduce((a, b) => a + (b || 0), 0);

        authFetch('/api/history', {
            method: 'POST',
            body: JSON.stringify({
                examType: questions[0]?.examType || 'ssc',
                testFormat: 'mock',
                score: localRawScore,
                total: questions.length,
                correct: localCorrect,
                incorrect: localIncorrect,
                unattempted: localUnattempted,
                totalMarks: localTotalMarks,
                maxMarks: localMaxMarks,
                percentage: parseFloat(localPercentage),
                totalTime: totalTimeSec,
                markingScheme: ms,
                topicBreakdown,
                isMultiplayer,
                answers,
                timeSpent,
                questions,
            }),
        })
        .then(res => {
            if (res.ok) return res.json();
            throw new Error('Failed to save history');
        })
        .then(data => {
            console.log("Saved test history successfully. Gamification return:", data);
            
            // Check for newly unlocked badges
            if (data.newlyUnlockedBadges && data.newlyUnlockedBadges.length > 0) {
                setCelebrationBadges(data.newlyUnlockedBadges);
            }
            
            // Check for level ups
            if (data.newLevel > data.oldLevel) {
                setLevelUpData({
                    oldLevel: data.oldLevel,
                    newLevel: data.newLevel
                });
            }
        })
        .catch((err) => {
            console.error("Error saving test history:", err);
        });
    }, [testStarted, questions, answers, timeSpent, ms, isMultiplayer, authFetch]);

    useEffect(() => {
        if (isMultiplayer && roomCode && room.getLeaderboard) {
            room.getLeaderboard().catch(() => { });
        }
    }, [isMultiplayer, roomCode, room.getLeaderboard]);

    if (!testStarted || questions.length === 0) return null;

    let correct = 0;
    let incorrect = 0;
    let attempted = 0;

    Object.keys(answers).forEach((qIndex) => {
        const val = answers[qIndex];
        if (val !== undefined && val !== -1) {
            attempted += 1;
            if (val === questions[qIndex].correctAnswer) {
                correct += 1;
            } else {
                incorrect += 1;
            }
        }
    });

    const unattempted = questions.length - attempted;

    const totalMarks = (correct * ms.correct) + (incorrect * ms.incorrect) + (unattempted * ms.unattempted);
    const maxMarks = questions.length * ms.correct;
    const percentage = ((correct / questions.length) * 100).toFixed(1);
    const hasNegative = ms.incorrect < 0;

    // Time heatmap data
    const allTimes = timeSpent.filter(t => t > 0);
    const avgTime = allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;

    const getHeatColor = (time) => {
        if (!time || time === 0) return 'var(--card-bg)'; // skipped
        const ratio = time / avgTime;
        if (ratio < 0.5) return '#10b981';  // fast - green
        if (ratio < 1.0) return '#34d399';  // normal-fast
        if (ratio < 1.5) return '#fbbf24';  // average - yellow
        if (ratio < 2.5) return '#f97316';  // slow - orange
        return '#ef4444';                    // very slow - red
    };

    const getHeatLabel = (time) => {
        if (!time || time === 0) return 'Skipped';
        const ratio = time / avgTime;
        if (ratio < 0.5) return 'Fast';
        if (ratio < 1.0) return 'Normal';
        if (ratio < 1.5) return 'Average';
        if (ratio < 2.5) return 'Slow';
        return 'Very Slow';
    };

    const handleBackHome = () => {
        if (isMultiplayer) room.leaveRoom();
        resetExam();
        navigate('/');
    };

    // Build collective results list
    const collectiveResults = [];
    if (isMultiplayer) {
        const resultsList = room.results || [];
        collectiveResults.push(...resultsList);
        
        // Find participants who haven't submitted yet
        const pendingParticipants = (room.participants || []).filter(p => {
            if (p.email) {
                return !resultsList.some(r => r.email === p.email);
            }
            return !resultsList.some(r => r.playerName === p.name);
        });
        
        // Add pending participants to the list
        pendingParticipants.forEach(p => {
            collectiveResults.push({
                playerName: p.name,
                email: p.email,
                isPending: true,
                connected: p.connected !== false,
                score: null,
                total: questions.length || 0,
                correct: null,
                incorrect: null,
                totalTime: null,
                answers: null,
            });
        });
    }

    const getBadgeName = (key) => {
        const names = {
            speed_demon: 'Speed Demon',
            dedicated_learner: 'Dedicated Learner',
            gladiator: 'Gladiator',
            accuracy_50: 'Bronze Marksman',
            accuracy_75: 'Silver Marksman',
            accuracy_100: 'Gold Marksman',
            master_reasoning: 'Reasoning Master',
            master_quant: 'Quant Master',
            master_english: 'English Master',
            master_gs: 'GS Master'
        };
        return names[key] || key;
    };

    const getBadgeDescription = (key) => {
        const descs = {
            speed_demon: 'Answered 5 consecutive questions correctly in under 5 seconds each',
            dedicated_learner: 'Completed 10 or more mock tests successfully',
            gladiator: 'Placed 1st in a multiplayer lobby of 3+ players',
            accuracy_50: 'Achieved at least 50% accuracy on a test of 5+ questions',
            accuracy_75: 'Achieved at least 75% accuracy on a test of 5+ questions',
            accuracy_100: 'Achieved 100% accuracy on a test of 5+ questions',
            master_reasoning: 'Achieved 100% accuracy in a Reasoning test of 5+ questions',
            master_quant: 'Achieved 100% accuracy in a Quantitative Aptitude test of 5+ questions',
            master_english: 'Achieved 100% accuracy in an English test of 5+ questions',
            master_gs: 'Achieved 100% accuracy in a General Studies test of 5+ questions'
        };
        return descs[key] || '';
    };

    return (
        <div className="results-container animate-fade-in">
            <header className="results-header glass">
                <div className="header-content">
                    <Award size={28} className="text-primary" />
                    <h2>Test Results Summary</h2>
                </div>
                <div className="results-header-actions">
                    {isMultiplayer && roomCode && (
                        <Button variant="primary" onClick={() => navigate('/leaderboard')}>
                            <Trophy size={16} /> Leaderboard
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleBackHome}>
                        <ChevronLeft size={16} /> New Test
                    </Button>
                </div>
            </header>

            <main className="results-content">
                <Card className="score-card glass">
                    <div className="score-circle">
                        <div className="score-value">{totalMarks}<span>/{maxMarks}</span></div>
                        <div className="score-percentage">{percentage}%</div>
                        {hasNegative && (
                            <div className="marking-info-badge">
                                +{ms.correct} / {ms.incorrect}
                            </div>
                        )}
                    </div>

                    <div className="score-stats">
                        <div className="stat-box">
                            <span className="stat-label">Correct</span>
                            <span className="stat-value text-success">{correct}</span>
                            {hasNegative && <span className="stat-marks positive">+{(correct * ms.correct).toFixed(1)}</span>}
                        </div>
                        <div className="stat-box">
                            <span className="stat-label">Incorrect</span>
                            <span className="stat-value text-danger">{incorrect}</span>
                            {hasNegative && incorrect > 0 && <span className="stat-marks negative">{(incorrect * ms.incorrect).toFixed(1)}</span>}
                        </div>
                        <div className="stat-box">
                            <span className="stat-label">Skipped</span>
                            <span className="stat-value text-slate-400">{unattempted}</span>
                        </div>
                        <div className="stat-box">
                            <span className="stat-label">Attempted</span>
                            <span className="stat-value text-blue-400">{attempted}</span>
                        </div>
                    </div>
                </Card>

                {/* Difficulty Heatmap */}
                <Card className="heatmap-card glass">
                    <h3 className="heatmap-title">🌡️ Time Difficulty Heatmap</h3>
                    <p className="heatmap-subtitle">Color shows how long you spent relative to average ({formatTime(Math.round(avgTime))})</p>
                    <div className="heatmap-grid">
                        {questions.map((_, idx) => {
                            const time = timeSpent[idx] || 0;
                            const userAnswer = answers[idx];
                            const isCorrect = userAnswer !== undefined && userAnswer === questions[idx].correctAnswer;
                            return (
                                <div
                                    key={idx}
                                    className={`heatmap-cell ${userAnswer === undefined ? 'skipped' : ''}`}
                                    style={{ '--heat-color': getHeatColor(time) }}
                                    title={`Q${idx + 1}: ${formatTime(time)} — ${getHeatLabel(time)}${userAnswer !== undefined ? (isCorrect ? ' ✅' : ' ❌') : ' (skipped)'}`}
                                >
                                    <span className="heatmap-num">{idx + 1}</span>
                                    {userAnswer !== undefined && (
                                        <span className={`heatmap-dot ${isCorrect ? 'correct' : 'wrong'}`}></span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="heatmap-legend">
                        <div className="legend-item"><span className="legend-color" style={{ background: '#10b981' }}></span> Fast</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: '#34d399' }}></span> Normal</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: '#fbbf24' }}></span> Average</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: '#f97316' }}></span> Slow</div>
                        <div className="legend-item"><span className="legend-color" style={{ background: '#ef4444' }}></span> V. Slow</div>
                    </div>
                </Card>

                {isMultiplayer && (
                    <Card className="results-leaderboard-card glass animate-fade-in" style={{ width: '100%', marginTop: '1.5rem', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                <Trophy className="text-amber" size={20} /> Room Leaderboard
                            </h3>
                            <span className="info-badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', color: 'var(--text-secondary)' }}>
                                {allSubmitted
                                    ? `All ${totalParticipants} submitted!`
                                    : `${(room.results || []).length} of ${totalParticipants} submitted — waiting...`
                                }
                            </span>
                        </div>

                        <div className="compact-leaderboard-table-wrapper" style={{ overflowX: 'auto' }}>
                            <table className="leaderboard-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>#</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Player</th>
                                        <th style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Marks (Score)</th>
                                        <th style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Time</th>
                                        <th style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {collectiveResults.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                No results yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        collectiveResults.map((r, idx) => {
                                            const isMe = r.playerName === room.playerName;
                                            const podiumLabels = ['🥇', '🥈', '🥉'];
                                            
                                            return (
                                                <tr key={idx} style={{ 
                                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                    background: isMe ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                    fontWeight: isMe ? '700' : '400'
                                                }}>
                                                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                                                        {r.isPending ? '-' : (idx < 3 ? podiumLabels[idx] : idx + 1)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                                                        <span 
                                                            style={{ textDecoration: 'underline', cursor: 'pointer', color: isMe ? 'var(--primary-light, #a5b4fc)' : 'inherit' }}
                                                            onClick={() => setActiveProfileQuery({ email: r.email, name: r.playerName })}
                                                            title={`View ${r.playerName}'s profile`}
                                                        >
                                                            {r.playerName}
                                                        </span>
                                                        {isMe && <span className="host-badge" style={{ marginLeft: '0.5rem', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>YOU</span>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.9rem' }}>
                                                        {r.isPending ? '-' : (r.marks !== undefined ? `${r.marks}/${r.maxMarks} (${r.score}/${r.total})` : `${r.score}/${r.total}`)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.9rem' }}>
                                                        {r.isPending ? '-' : (r.totalTime ? `${Math.floor(r.totalTime / 60)}:${(r.totalTime % 60).toString().padStart(2, '0')}` : '0:00')}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.9rem' }}>
                                                        {r.isPending ? (
                                                            <span style={{ 
                                                                fontSize: '0.7rem', 
                                                                color: r.connected ? '#34d399' : '#f87171',
                                                                background: r.connected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                padding: '0.15rem 0.4rem',
                                                                borderRadius: '4px',
                                                                fontWeight: '700'
                                                            }}>
                                                                {r.connected ? '✍️ Testing' : '❌ Offline'}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '700' }}>
                                                                ✅ Submitted
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                <div className="detailed-review">
                    <div className="review-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 className="review-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>Detailed Validations & Explanations</h3>
                        <div className="reattempt-toggle-container glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>🧠 Reattempt Mode</span>
                            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                                <input 
                                    type="checkbox" 
                                    checked={reatattemptMode} 
                                    onChange={(e) => setReattemptMode(e.target.checked)} 
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span className="slider" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, background: reattemptMode ? 'var(--primary)' : 'rgba(255,255,255,0.1)', transition: '.3s', borderRadius: '20px' }}>
                                    <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: reattemptMode ? '22px' : '3px', bottom: '3px', background: 'white', transition: '.3s', borderRadius: '50%' }}></span>
                                </span>
                            </label>
                        </div>
                    </div>

                    {questions.map((q, idx) => {
                        const userAnswer = answers[idx];
                        const isCorrect = userAnswer === q.correctAnswer;
                        const isAttempted = userAnswer !== undefined && userAnswer !== -1;

                        const cardBorderClass = reattemptMode 
                            ? 'skipped-border' 
                            : (isAttempted ? (isCorrect ? 'correct-border' : 'incorrect-border') : 'skipped-border');

                        const chosenIdx = reattempts[idx];
                        const isReattempted = chosenIdx !== undefined;

                        return (
                            <Card key={idx} className={`review-card ${cardBorderClass}`}>
                                <div className="review-q-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span className="q-number">Question {idx + 1}</span>
                                        <span className="q-time text-slate-400" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                                            <Clock size={14} /> {formatTime(timeSpent?.[idx] || 0)}
                                        </span>
                                        {!reatattemptMode && isAttempted && (
                                            <span className={`marks-pill ${isCorrect ? 'positive' : 'negative'}`}>
                                                {isCorrect ? `+${ms.correct}` : ms.incorrect}
                                            </span>
                                        )}
                                    </div>
                                    {!reatattemptMode && (
                                        <div className="q-status">
                                            {!isAttempted && <span className="status-badge skipped">Skipped</span>}
                                            {isAttempted && isCorrect && <span className="status-badge correct"><CheckCircle size={14} /> Correct</span>}
                                            {isAttempted && !isCorrect && <span className="status-badge incorrect"><XCircle size={14} /> Incorrect</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="review-q-text">
                                    <QuestionRenderer text={q.text} subject={q.subject} />
                                </div>

                                <div className="review-options">
                                    {q.options.map((opt, optIdx) => {
                                        let optClass = "review-opt ";
                                        if (!reatattemptMode) {
                                            if (optIdx === q.correctAnswer) optClass += "is-correct";
                                            else if (userAnswer === optIdx) optClass += "is-wrong";
                                        } else {
                                            optClass += "clickable ";
                                            if (isReattempted) {
                                                if (optIdx === q.correctAnswer) optClass += "is-correct";
                                                else if (optIdx === chosenIdx && chosenIdx !== q.correctAnswer) optClass += "is-wrong";
                                            }
                                        }

                                        return (
                                            <div 
                                                key={optIdx} 
                                                className={optClass}
                                                onClick={() => {
                                                    if (reatattemptMode && !isReattempted) {
                                                        setReattempts(prev => ({ ...prev, [idx]: optIdx }));
                                                    }
                                                }}
                                                style={{ cursor: (reatattemptMode && !isReattempted) ? 'pointer' : 'default' }}
                                            >
                                                <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                                                <span className="opt-text">{opt}</span>
                                                {!reatattemptMode ? (
                                                    <>
                                                        {optIdx === q.correctAnswer && <CheckCircle className="opt-icon success" size={16} />}
                                                        {userAnswer === optIdx && !isCorrect && <XCircle className="opt-icon danger" size={16} />}
                                                    </>
                                                ) : (
                                                    isReattempted && (
                                                        <>
                                                            {optIdx === q.correctAnswer && <CheckCircle className="opt-icon success" size={16} />}
                                                            {optIdx === chosenIdx && chosenIdx !== q.correctAnswer && <XCircle className="opt-icon danger" size={16} />}
                                                        </>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {reattemptMode && (
                                    <div className="reattempt-feedback-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingBottom: '1rem', borderBottom: isReattempted && q.explanation ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            <span>First Attempt: </span>
                                            {isAttempted ? (
                                                <span style={{ fontWeight: '600', color: isCorrect ? 'var(--success)' : 'var(--danger)' }}>
                                                    Option {String.fromCharCode(65 + userAnswer)} ({isCorrect ? 'Correct' : 'Incorrect'})
                                                </span>
                                            ) : (
                                                <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Skipped</span>
                                            )}
                                        </div>
                                        {isReattempted && (
                                            <button 
                                                onClick={() => {
                                                    setReattempts(prev => { const upd = {...prev}; delete upd[idx]; return upd; });
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--primary)',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem'
                                                }}
                                            >
                                                <RefreshCw size={12} /> Try Again
                                            </button>
                                        )}
                                    </div>
                                )}

                                {(!reattemptMode || isReattempted) && q.explanation && (
                                    <div className="explanation-box" style={{ marginTop: reattemptMode ? '1rem' : '0' }}>
                                        <h5>Explanation</h5>
                                        <p>{q.explanation}</p>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </main>
            {/* Room Chat */}
            {isMultiplayer && room.enableChat !== false && room.socket && (
                <FriendlyChat 
                    socket={room.socket} 
                    roomCode={roomCode || room.roomCode} 
                    displayName={room.playerName} 
                    onUserClick={setActiveProfileQuery} 
                />
            )}
            {activeProfileQuery && (
                <UserProfileModal 
                    queryEmail={activeProfileQuery.email}
                    queryName={activeProfileQuery.name}
                    onClose={() => setActiveProfileQuery(null)}
                />
            )}

            {/* Newly Unlocked Badges Celebration Overlay */}
            {celebrationBadges.length > 0 && activeBadgeIndex < celebrationBadges.length && (
                <div className="celebration-overlay">
                    <Confetti />
                    <h2 className="celebration-title-alert animate-bounce">🏆 NEW ACHIEVEMENT UNLOCKED!</h2>
                    
                    <div 
                        className={`flip-card-container ${isCardFlipped ? 'flipped' : ''}`} 
                        onClick={() => setIsCardFlipped(true)}
                    >
                        <div className="flip-card-inner">
                            {/* Card Front (Mystery Side) */}
                            <div className="flip-card-front">
                                <div className="flip-card-front-logo">
                                    <Award size={48} style={{ color: '#818cf8' }} />
                                </div>
                                <h4>You Earned a Badge!</h4>
                                <p>Click the card to reveal your prize</p>
                            </div>
                            
                            {/* Card Back (Revealed Badge) */}
                            <div className="flip-card-back">
                                <div className="badge-reveal-glow">
                                    <BadgeIcon badgeKey={celebrationBadges[activeBadgeIndex]} size={110} animated={true} />
                                </div>
                                <h3 className="badge-reveal-name">{getBadgeName(celebrationBadges[activeBadgeIndex])}</h3>
                                <p className="badge-reveal-desc">{getBadgeDescription(celebrationBadges[activeBadgeIndex])}</p>
                            </div>
                        </div>
                    </div>

                    {isCardFlipped && (
                        <div className="celebration-btn-row animate-fade-in">
                            {activeBadgeIndex < celebrationBadges.length - 1 ? (
                                <Button variant="primary" onClick={() => {
                                    setIsCardFlipped(false);
                                    setActiveBadgeIndex(prev => prev + 1);
                                }}>
                                    Next Badge
                                </Button>
                            ) : (
                                <Button variant="primary" onClick={() => {
                                    setCelebrationBadges([]); // Close badge celebration
                                }}>
                                    Awesome!
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Level Up Celebration Overlay */}
            {celebrationBadges.length === 0 && levelUpData && (
                <div className="celebration-overlay">
                    <Confetti />
                    <div className="level-up-modal glass">
                        <Award size={64} style={{ color: '#fbbf24' }} className="animate-pulse" />
                        <h2>LEVEL UP!</h2>
                        <p>Your dedication is paying off. Keep up the amazing work!</p>
                        
                        <div className="level-up-gauge">
                            <span className="level-up-num">{levelUpData.oldLevel}</span>
                            <span className="level-up-arrow">➔</span>
                            <span className="level-up-num">{levelUpData.newLevel}</span>
                        </div>
                        
                        <p className="level-up-bonus">🎉 You earned a flat 100 XP level-up bonus!</p>
                        
                        <Button variant="primary" onClick={() => setLevelUpData(null)} style={{ marginTop: '1rem' }}>
                            Continue
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Results;
