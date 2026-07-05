import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import Card from './ui/Card';
import Button from './ui/Button';
import { 
    X, Award, Clock, ChevronLeft, Eye, CheckCircle, XCircle, 
    RefreshCw, Flame, Sparkles, Lock, Trophy, Calendar, BookOpen 
} from 'lucide-react';
import QuestionRenderer from './QuestionRenderer';
import BadgeIcon from './BadgeSVGs';
import ContributionCalendar from './ContributionCalendar';
import SolutionsView from './SolutionsView';
import './UserProfileModal.css';

const UserProfileModal = ({ queryEmail, queryName, onClose }) => {
    const { authFetch } = useAuth();
    const [profile, setProfile] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [error, setError] = useState('');

    // Active Tab state ('overview' or 'history')
    const [activeTab, setActiveTab] = useState('overview');

    // Detailed exam view state
    const [selectedExamDetail, setSelectedExamDetail] = useState(null);
    const [loadingExamDetail, setLoadingExamDetail] = useState(false);

    // Reattempt states: { [questionId]: selectedOptionIndex }
    const [reattempts, setReattempts] = useState({});
    const [reattemptMode, setReattemptMode] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null);

    // Fetch user profile and written exams list
    useEffect(() => {
        let url = '/api/users/profile';
        const params = [];

        // Clean up email/name query
        const cleanEmail = (queryEmail && queryEmail !== 'null' && queryEmail !== 'undefined') ? queryEmail.trim() : null;
        const cleanName = (queryName && queryName !== 'null' && queryName !== 'undefined') ? queryName.trim() : null;

        if (cleanEmail) {
            params.push(`email=${encodeURIComponent(cleanEmail)}`);
        } else if (cleanName) {
            params.push(`name=${encodeURIComponent(cleanName)}`);
        } else {
            Promise.resolve().then(() => {
                setLoadingProfile(false);
                setError('No user query provided');
            });
            return;
        }

        url += `?${params.join('&')}`;

        Promise.resolve().then(() => {
            setLoadingProfile(true);
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
                setLoadingProfile(false);
            })
            .catch(err => {
                setError(err.message);
                setLoadingProfile(false);
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
            if (!time || time === 0) return 'var(--card-bg)';
            const ratio = time / avgTime;
            if (ratio < 0.5) return '#10b981';
            if (ratio < 1.0) return '#34d399';
            if (ratio < 1.5) return '#fbbf24';
            if (ratio < 2.5) return '#f97316';
            return '#ef4444';
        };

        return (
            <div className="player-heatmap-card glass padding-4" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '1rem' }}>
                <h3 className="section-title text-sm font-semibold mb-2" style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem' }}>🌡️ Time Difficulty Heatmap</h3>
                <p className="heatmap-subtitle text-xs text-slate-400 mb-3" style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Color shows time spent vs average ({formatTime(Math.round(avgTime))})</p>
                <div className="heatmap-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {questions.map((_, idx) => {
                        const time = timeSpent[idx] || 0;
                        const userAnswer = selectedExamDetail.answers?.[idx];
                        const isCorrect = userAnswer !== undefined && userAnswer === questions[idx].correctAnswer;
                        return (
                            <div
                                key={idx}
                                className={`heatmap-cell ${userAnswer === undefined ? 'skipped' : ''}`}
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    background: getHeatColor(time),
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    cursor: 'help'
                                }}
                                title={`Q${idx + 1}: ${formatTime(time)}${userAnswer !== undefined ? (isCorrect ? ' ✅' : ' ❌') : ' (skipped)'}`}
                            >
                                <span className="heatmap-num font-medium" style={{ color: 'white', fontWeight: '600' }}>{idx + 1}</span>
                                {userAnswer !== undefined && (
                                    <span className={`heatmap-dot ${isCorrect ? 'correct' : 'wrong'}`} style={{
                                        position: 'absolute',
                                        bottom: '2px',
                                        width: '4px',
                                        height: '4px',
                                        borderRadius: '50%',
                                        background: isCorrect ? '#10b981' : '#ef4444'
                                    }}></span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="upm-backdrop animate-fade-in">
            <div className="upm-modal glass animate-scale-in">
                {/* Modal Header */}
                <div className="upm-header">
                    <div className="upm-user-profile">
                        <div className="upm-avatar">
                            {(profile?.name || queryName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2>{profile?.name || queryName || 'User'}</h2>
                            <span className="upm-email">{profile?.email || queryEmail || 'Loading email...'}</span>
                        </div>
                    </div>
                    <button className="upm-close-btn" onClick={onClose} title="Close Profile">
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="upm-content">
                    {loadingProfile ? (
                        <div className="upm-loader">
                            <div className="loading-spinner"></div>
                            <p>Loading user profile & history...</p>
                        </div>
                    ) : error ? (
                        <div className="upm-error-box glass">
                            <p>⚠️ {error}</p>
                        </div>
                    ) : !selectedExamDetail && !loadingExamDetail ? (
                        /* Tabs Selection inside profile view */
                        <div className="upm-tabs-container">
                            <div className="upm-tabs">
                                <button 
                                    className={`upm-tab ${activeTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    <Sparkles size={14} /> Overview & Badges
                                </button>
                                <button 
                                    className={`upm-tab ${activeTab === 'history' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('history')}
                                >
                                    <BookOpen size={14} /> Exams Written ({history.length})
                                </button>
                            </div>

                            {activeTab === 'overview' ? (
                                <div className="upm-overview-tab animate-fade-in">
                                    {/* Level & Streak Cards */}
                                    <div className="upm-stats-row">
                                        <Card className="upm-stat-card glass">
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
                                                        {(profile.nextLevelXp || 100) - levelMetrics.xp} XP to Level {levelMetrics.level + 1}
                                                    </p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card className="upm-stat-card glass">
                                            <div className="streak-flame-wrapper">
                                                <div className="streak-flame">
                                                    <Flame size={38} className="flame-icon pulsing" />
                                                </div>
                                                <div className="streak-info">
                                                    <h3 className="streak-header">Testing Streak</h3>
                                                    <span className="streak-count">{profile.streak || 0} Day{profile.streak !== 1 ? 's' : ''}</span>
                                                    <p className="streak-message">
                                                        {profile.streak > 0 
                                                            ? 'Streak is burning bright! Keep taking daily tests.'
                                                            : 'Take daily tests to build up a learning streak.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </Card>
                                    </div>

                                    {/* Contribution Calendar grid */}
                                    <div className="upm-calendar-wrapper">
                                        <ContributionCalendar activity={profile.activity || {}} />
                                    </div>

                                    {/* Badges showcase grid */}
                                    <Card className="upm-badges-card glass">
                                        <h3>Achievements Showcase</h3>
                                        <p className="upm-badges-subtitle">Badges unlocked by completing tests with high accuracy and speed</p>
                                        
                                        <div className="upm-badges-grid">
                                            {profile.badges?.map((badge) => (
                                                <div 
                                                    key={badge.key} 
                                                    className={`badge-item-wrap ${badge.isUnlocked ? 'unlocked' : 'locked'}`}
                                                    onClick={() => setSelectedBadge(badge)}
                                                >
                                                    <div className="badge-visual-container">
                                                        <BadgeIcon badgeKey={badge.key} size={58} animated={badge.isUnlocked} />
                                                        {badge.isUnlocked && badge.earnedCount > 1 && (
                                                            <div className="badge-multiplier">x{badge.earnedCount}</div>
                                                        )}
                                                        {!badge.isUnlocked && (
                                                            <div className="badge-lock-shield">
                                                                <Lock size={13} className="lock-svg" />
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
                            ) : (
                                /* List of Exams Written */
                                <div className="upm-history-list animate-fade-in">
                                    {history.length === 0 ? (
                                        <div className="upm-empty">No exams recorded yet.</div>
                                    ) : (
                                        <div className="upm-history-grid">
                                            {history.map((h) => (
                                                <Card key={h.id} className="upm-history-card glass hover-lift" onClick={() => handleSelectExam(h.id)}>
                                                    <div className="upm-card-left">
                                                        <span className="upm-exam-tag">{h.examType.toUpperCase()}</span>
                                                        <span className="upm-date">{new Date(h.date).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="upm-card-center">
                                                        <div className="upm-pct-val">{h.percentage}%</div>
                                                        <span className="upm-score-val">{h.score}/{h.total} correct</span>
                                                    </div>
                                                    <div className="upm-card-right">
                                                        <Eye size={16} className="text-secondary" />
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : loadingExamDetail ? (
                        <div className="upm-loader">
                            <div className="loading-spinner"></div>
                            <p>Loading exam breakdown...</p>
                        </div>
                    ) : (
                        /* Detailed Exam Review Screen using new SolutionsView */
                        <SolutionsView 
                            questions={selectedExamDetail.questions}
                            answers={selectedExamDetail.answers || {}}
                            timeSpent={selectedExamDetail.timeSpent || []}
                            onClose={() => setSelectedExamDetail(null)}
                        />
                    )}
                </div>
            </div>

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

export default UserProfileModal;
