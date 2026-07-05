import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import BadgeIcon from '../components/BadgeSVGs';
import ContributionCalendar from '../components/ContributionCalendar';
import QuestionRenderer from '../components/QuestionRenderer';
import PerformanceCharts from '../components/PerformanceCharts';
import { 
    ChevronLeft, Award, Clock, Eye, CheckCircle, XCircle, 
    RefreshCw, Flame, Sparkles, Lock, Trophy, Calendar, BookOpen, X 
} from 'lucide-react';
import './Profile.css';

const Profile = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();
    const [searchParams] = useSearchParams();
    
    // Get query details from URL if viewing a friend's profile
    const queryEmail = searchParams.get('email');
    const queryName = searchParams.get('name');

    const [profile, setProfile] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Detailed exam view state
    const [selectedExamDetail, setSelectedExamDetail] = useState(null);
    const [loadingExamDetail, setLoadingExamDetail] = useState(false);

    // Reattempt states
    const [reattempts, setReattempts] = useState({});
    const [reattemptMode, setReattemptMode] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null);

    // Fetch user profile & test history
    useEffect(() => {
        let url = '/api/users/profile';
        const params = [];
        
        // Clean up email/name query
        const cleanEmail = (queryEmail && queryEmail !== 'null' && queryEmail !== 'undefined') ? queryEmail.trim() : null;
        const cleanName = (queryName && queryName !== 'null' && queryName !== 'undefined') ? queryName.trim() : null;

        if (cleanEmail) params.push(`email=${encodeURIComponent(cleanEmail)}`);
        else if (cleanName) params.push(`name=${encodeURIComponent(cleanName)}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }

        Promise.resolve().then(() => {
            setLoading(true);
            setError('');
        });
        authFetch(url)
            .then(r => {
                if (!r.ok) {
                    if (r.status === 404) throw new Error('User has not completed any exams yet or profile not found.');
                    throw new Error('Failed to load user profile');
                }
                return r.json();
            })
            .then(data => {
                setProfile(data.user);
                setHistory(data.history || []);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [queryEmail, queryName, authFetch]);

    // Fetch details of a specific exam
    const handleSelectExam = (examId) => {
        setLoadingExamDetail(true);
        setSelectedExamDetail(null);
        setReattempts({});

        authFetch(`/api/history/${examId}`)
            .then(r => {
                if (!r.ok) throw new Error('Failed to load exam details');
                return r.json();
            })
            .then(data => {
                setSelectedExamDetail(data.detail);
                setLoadingExamDetail(false);
            })
            .catch(err => {
                alert(err.message);
                setLoadingExamDetail(false);
            });
    };

    const formatTime = (seconds) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // const formatDuration = (seconds) => {
    //     const h = Math.floor(seconds / 3600);
    //     const m = Math.floor((seconds % 3600) / 60);
    //     if (h > 0) return `${h}h ${m}m`;
    //     return `${m}m`;
    // };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Level progression calculations
    const levelMetrics = useMemo(() => {
        if (!profile) return null;
        const { xp, level, currentLevelMinXp, nextLevelXp } = profile;
        const levelRange = (nextLevelXp || 100) - (currentLevelMinXp || 0);
        const levelProgress = levelRange > 0 ? (xp - (currentLevelMinXp || 0)) / levelRange : 0;
        return {
            xp: xp || 0,
            level: level || 1,
            progressPercent: Math.min(100, Math.max(0, Math.floor(levelProgress * 100)))
        };
    }, [profile]);

    // Heatmap helper (relative to average time)
    const renderHeatmap = (timeSpent, questions) => {
        const allTimes = timeSpent.filter(t => t > 0);
        const avgTime = allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;

        const getHeatColor = (time) => {
            if (!time || time === 0) return 'rgba(255, 255, 255, 0.05)';
            const ratio = time / avgTime;
            if (ratio < 0.5) return '#10b981';
            if (ratio < 1.0) return '#34d399';
            if (ratio < 1.5) return '#fbbf24';
            if (ratio < 2.5) return '#f97316';
            return '#ef4444';
        };

        return (
            <Card className="heatmap-card glass">
                <h3 className="heatmap-title">🌡️ Time Difficulty Heatmap</h3>
                <p className="heatmap-subtitle">Color shows time spent vs average ({formatTime(Math.round(avgTime))})</p>
                <div className="heatmap-grid">
                    {questions.map((_, idx) => {
                        const time = timeSpent[idx] || 0;
                        const userAnswer = selectedExamDetail.answers?.[idx];
                        const isCorrect = userAnswer !== undefined && userAnswer === questions[idx].correctAnswer;
                        return (
                            <div
                                key={idx}
                                className={`heatmap-cell ${userAnswer === undefined ? 'skipped' : ''}`}
                                style={{ background: getHeatColor(time) }}
                                title={`Q${idx + 1}: ${formatTime(time)}${userAnswer !== undefined ? (isCorrect ? ' ✅' : ' ❌') : ' (skipped)'}`}
                            >
                                <span className="heatmap-num">{idx + 1}</span>
                                {userAnswer !== undefined && (
                                    <span className={`heatmap-dot ${isCorrect ? 'correct' : 'wrong'}`}></span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Card>
        );
    };

    if (loading) {
        return (
            <div className="profile-container animate-fade-in">
                <div className="loading-screen"><div className="loading-spinner" /></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="profile-container animate-fade-in">
                <div className="profile-header-back">
                    <Button variant="ghost" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back</Button>
                </div>
                <Card className="error-state glass">
                    <h2>Profile Loading Error</h2>
                    <p>⚠️ {error}</p>
                    <Button variant="primary" onClick={() => navigate('/')}>Return to Lobby</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="profile-container animate-fade-in">
            {/* Header Back Link */}
            <div className="profile-header-back">
                <Button variant="ghost" onClick={() => navigate(-1)}><ChevronLeft size={16} /> Back</Button>
            </div>

            {/* Profile Overview Card */}
            {profile && !selectedExamDetail && !loadingExamDetail && (
                <div className="profile-grid">
                    {/* Left Column: Profile Card + Level + Badges */}
                    <div className="profile-main-col">
                        <Card className="profile-info-card glass">
                            <div className="profile-meta-row">
                                <div className="profile-avatar">
                                    {profile.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="profile-details">
                                    <h2>{profile.name}</h2>
                                    <span className="profile-email-text">{profile.email}</span>
                                    <div className="profile-level-badge">
                                        <Sparkles size={12} className="text-yellow-400" />
                                        <span>Level {levelMetrics.level} Enthusiast</span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Level and Streak Stats Row */}
                        <div className="profile-stats-grid">
                            <Card className="profile-level-card glass">
                                <div className="level-gauge-wrapper">
                                    <div className="level-gauge">
                                        <svg viewBox="0 0 100 100" className="radial-progress">
                                            <circle cx="50" cy="50" r="40" className="radial-bg" />
                                            <circle 
                                                cx="50" 
                                                cy="50" 
                                                r="40" 
                                                className="radial-fill" 
                                                style={{ strokeDasharray: `${2 * Math.PI * 40}`, strokeDashoffset: `${2 * Math.PI * 40 * (1 - levelMetrics.progressPercent / 100)}` }}
                                            />
                                        </svg>
                                        <div className="level-gauge-text">
                                            <span className="lvl-num">{levelMetrics.level}</span>
                                            <span className="lvl-lbl">LEVEL</span>
                                        </div>
                                    </div>
                                    <div className="level-info">
                                        <h3 className="lvl-header">Rank Status</h3>
                                        <p className="xp-details">
                                            <Sparkles size={12} className="xp-icon" /> 
                                            <strong>{levelMetrics.xp} XP</strong> total
                                        </p>
                                        <div className="xp-progress-bar-bg">
                                            <div className="xp-progress-bar-fill" style={{ width: `${levelMetrics.progressPercent}%` }}></div>
                                        </div>
                                        <p className="xp-remaining">
                                            {profile.nextLevelXp - levelMetrics.xp} XP to Level {levelMetrics.level + 1}
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card className="profile-streak-card glass">
                                <div className="streak-flame-wrapper">
                                    <div className="streak-flame">
                                        <Flame size={44} className="flame-icon pulsing" />
                                    </div>
                                    <div className="streak-info">
                                        <h3 className="streak-header">Testing Streak</h3>
                                        <span className="streak-count">{profile.streak} Day{profile.streak !== 1 ? 's' : ''}</span>
                                        <p className="streak-message">
                                            {profile.streak > 0 
                                                ? 'Active mock testing streak is burning bright!'
                                                : 'Take daily tests to build up a learning streak.'}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Advanced Performance Charts Widget */}
                        {history && history.length > 0 && (
                            <PerformanceCharts history={history} />
                        )}

                        {/* Consistency Calendar Widget */}
                        <div className="calendar-section">
                            <ContributionCalendar activity={profile.activity || {}} />
                        </div>

                        {/* Badges Showcase Widget */}
                        <Card className="badges-showcase-card glass">
                            <h3>Achievements Showcase</h3>
                            <p className="badges-subtitle">Badges unlocked by completing tests with high accuracy and speed</p>
                            
                            <div className="badges-showcase-grid">
                                {profile.badges.map((badge) => (
                                    <div 
                                        key={badge.key} 
                                        className={`badge-item-wrap ${badge.isUnlocked ? 'unlocked' : 'locked'}`}
                                        onClick={() => setSelectedBadge(badge)}
                                    >
                                        <div className="badge-visual-container">
                                            <BadgeIcon badgeKey={badge.key} size={68} animated={badge.isUnlocked} />
                                            {badge.isUnlocked && badge.earnedCount > 1 && (
                                                <div className="badge-multiplier">x{badge.earnedCount}</div>
                                            )}
                                            {!badge.isUnlocked && (
                                                <div className="badge-lock-shield">
                                                    <Lock size={15} className="lock-svg" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="badge-details-box">
                                            <span className="badge-name-text">{badge.name}</span>
                                            <span className="badge-desc-text">{badge.description}</span>
                                            {badge.isUnlocked ? (
                                                <span className="badge-earned-label">
                                                    Unlocked {badge.earnedAt ? formatDate(badge.earnedAt) : 'Recently'}
                                                </span>
                                            ) : (
                                                <span className="badge-locked-label">Locked</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Recent Tests Summary */}
                    <div className="profile-sidebar-col">
                        <Card className="profile-recent-card glass">
                            <div className="sidebar-recent-header">
                                <BookOpen size={20} className="sidebar-recent-icon" />
                                <h3>Test History ({history.length})</h3>
                            </div>
                            
                            <div className="sidebar-tests-list">
                                {history.length === 0 ? (
                                    <div className="sidebar-tests-empty">
                                        <p>No test attempts found.</p>
                                    </div>
                                ) : (
                                    history.map((h) => (
                                        <div 
                                            key={h.id} 
                                            className="sidebar-test-row hover-lift"
                                            onClick={() => handleSelectExam(h.id)}
                                        >
                                            <div className="sidebar-test-details">
                                                <span className="s-exam-type">{h.examType.toUpperCase()} Mock</span>
                                                <span className="s-exam-date">{formatDate(h.date)}</span>
                                            </div>
                                            <div className="sidebar-test-score">
                                                <span className={`s-pct-badge ${h.percentage >= 70 ? 'good' : h.percentage >= 40 ? 'avg' : 'low'}`}>
                                                    {h.percentage?.toFixed(0)}%
                                                </span>
                                                <span className="s-raw-score">{h.score}/{h.total}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {loadingExamDetail && (
                <div className="loading-screen" style={{ minHeight: '300px' }}><div className="loading-spinner" /></div>
            )}

            {/* Detailed Exam Breakdown Review View */}
            {selectedExamDetail && !loadingExamDetail && (
                <div className="profile-exam-detail animate-fade-in">
                    <Card className="exam-detail-header-card glass">
                        <div className="upm-detail-nav">
                            <Button variant="ghost" className="btn-sm" onClick={() => setSelectedExamDetail(null)}>
                                <ChevronLeft size={16} /> Back to Profile Summary
                            </Button>
                            <span className="upm-detail-title">
                                {selectedExamDetail.examType.toUpperCase()} Exam Breakdown — Score: {selectedExamDetail.score}/{selectedExamDetail.total} ({selectedExamDetail.percentage}%)
                            </span>
                        </div>
                    </Card>

                    {/* Render Heatmap */}
                    {selectedExamDetail.timeSpent && renderHeatmap(selectedExamDetail.timeSpent, selectedExamDetail.questions)}

                    {/* Questions review with reattempt option */}
                    <div className="upm-questions-review">
                        <div className="review-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <h3 className="section-title" style={{ margin: 0 }}>📋 Detailed Questions Review & Reattempt</h3>
                            <div className="reattempt-toggle-container glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>🧠 Reattempt Mode</span>
                                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={reattemptMode} 
                                        onChange={(e) => setReattemptMode(e.target.checked)} 
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span className="slider" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, background: reattemptMode ? 'var(--primary)' : 'rgba(255,255,255,0.1)', transition: '.3s', borderRadius: '20px' }}>
                                        <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: reattemptMode ? '22px' : '3px', bottom: '3px', background: 'white', transition: '.3s', borderRadius: '50%' }}></span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        {selectedExamDetail.questions.map((q, idx) => {
                            const userAnswer = selectedExamDetail.answers?.[idx];
                            const isCorrect = userAnswer !== undefined && userAnswer === q.correctAnswer;
                            const isAttempted = userAnswer !== undefined && userAnswer !== -1;

                            const cardBorderClass = reattemptMode 
                                ? 'skipped-border' 
                                : (isAttempted ? (isCorrect ? 'correct-border' : 'incorrect-border') : 'skipped-border');

                            const chosenIdx = reattempts[idx];
                            const isReattempted = chosenIdx !== undefined;

                            return (
                                <Card key={idx} className={`review-card ${cardBorderClass} mb-4`}>
                                    <div className="review-q-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <span className="q-number">Question {idx + 1}</span>
                                            {selectedExamDetail.timeSpent?.[idx] > 0 && (
                                                <span className="q-time text-slate-400" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                                    <Clock size={14} /> {formatTime(selectedExamDetail.timeSpent[idx])}
                                                </span>
                                            )}
                                        </div>
                                        {!reattemptMode && (
                                            <div className="q-status">
                                                {!isAttempted && <span className="status-badge skipped">Skipped</span>}
                                                {isAttempted && isCorrect && <span className="status-badge correct"><CheckCircle size={14} /> Correct</span>}
                                                {isAttempted && !isCorrect && <span className="status-badge incorrect"><XCircle size={14} /> Incorrect</span>}
                                            </div>
                                        )}
                                    </div>

                                    <div className="review-q-text mb-4">
                                        <QuestionRenderer text={q.text} subject={q.subject} />
                                    </div>

                                    <div className="review-options mb-3">
                                        {q.options.map((opt, optIdx) => {
                                            let optClass = "review-opt ";
                                            if (!reattemptMode) {
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
                                                        if (reattemptMode && !isReattempted) {
                                                            setReattempts(prev => ({ ...prev, [idx]: optIdx }));
                                                        }
                                                    }}
                                                    style={{ cursor: (reattemptMode && !isReattempted) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', padding: '1rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '0.75rem' }}
                                                >
                                                    <span className="opt-letter" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginRight: '1rem', fontSize: '0.875rem', fontWeight: '600' }}>{String.fromCharCode(65 + optIdx)}</span>
                                                    <span className="opt-text" style={{ flex: 1 }}>{opt}</span>
                                                    {!reattemptMode ? (
                                                        <>
                                                            {optIdx === q.correctAnswer && <CheckCircle className="opt-icon success" style={{ marginLeft: '1rem', color: '#34d399' }} size={16} />}
                                                            {userAnswer === optIdx && !isCorrect && <XCircle className="opt-icon danger" style={{ marginLeft: '1rem', color: '#f87171' }} size={16} />}
                                                        </>
                                                    ) : (
                                                        isReattempted && (
                                                            <>
                                                                {optIdx === q.correctAnswer && <CheckCircle className="opt-icon success" style={{ marginLeft: '1rem', color: '#34d399' }} size={16} />}
                                                                {optIdx === chosenIdx && chosenIdx !== q.correctAnswer && <XCircle className="opt-icon danger" style={{ marginLeft: '1rem', color: '#f87171' }} size={16} />}
                                                            </>
                                                        )
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {reattemptMode && (
                                        <div className="reattempt-feedback-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingBottom: '1rem', borderBottom: isReattempted && q.explanation ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                <span>First Attempt: </span>
                                                {isAttempted ? (
                                                    <span style={{ fontWeight: '600', color: isCorrect ? '#34d399' : '#f87171' }}>
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
                                                        fontSize: '0.75rem',
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
                                        <div className="explanation-box mb-4" style={{ marginTop: reattemptMode ? '1rem' : '0' }}>
                                            <h5>Explanation</h5>
                                            <p>{q.explanation}</p>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {selectedBadge && (
                <div className="badge-modal-backdrop" onClick={() => setSelectedBadge(null)}>
                    <div className="badge-modal-card glass" onClick={(e) => e.stopPropagation()}>
                        <button className="badge-modal-close" onClick={() => setSelectedBadge(null)}>
                            <X size={16} />
                        </button>
                        <div className="badge-modal-visual">
                            <BadgeIcon badgeKey={selectedBadge.key} size={80} animated={selectedBadge.isUnlocked} />
                            {!selectedBadge.isUnlocked && (
                                <div className="badge-modal-lock">
                                    <Lock size={16} />
                                </div>
                            )}
                        </div>
                        <h3 className="badge-modal-name">{selectedBadge.name}</h3>
                        <p className="badge-modal-desc">{selectedBadge.description}</p>
                        
                        <div className={`badge-modal-status ${selectedBadge.isUnlocked ? 'unlocked' : 'locked'}`}>
                            {selectedBadge.isUnlocked ? (
                                <>
                                    <CheckCircle size={16} />
                                    <span>Unlocked {selectedBadge.earnedAt ? formatDate(selectedBadge.earnedAt) : 'Recently'}</span>
                                </>
                            ) : (
                                <>
                                    <Lock size={16} />
                                    <span>Locked — Complete requirements to unlock</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;
