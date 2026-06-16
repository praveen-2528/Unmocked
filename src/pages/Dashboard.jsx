import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import BadgeIcon from '../components/BadgeSVGs';
import ContributionCalendar from '../components/ContributionCalendar';
import { 
    ChevronLeft, Trash2, TrendingUp, Target, Clock, Award, 
    BarChart3, Flame, Lock, Users, Play, Sparkles 
} from 'lucide-react';
import './Dashboard.css';
import UserProfileModal from '../components/UserProfileModal';

const Dashboard = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gamification, setGamification] = useState(null);
    const [friendsFeed, setFriendsFeed] = useState([]);
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    useEffect(() => {
        // Fetch test history
        authFetch('/api/history')
            .then(r => r.json())
            .then(data => { 
                setHistory(data.history || []); 
                setLoading(false); 
            })
            .catch(() => setLoading(false));

        // Fetch gamification stats
        authFetch('/api/gamification/stats')
            .then(r => r.json())
            .then(data => { 
                if (!data.error) setGamification(data); 
            })
            .catch(err => console.error("Error loading gamification stats:", err));

        // Fetch friends feed
        authFetch('/api/gamification/friends-feed')
            .then(r => r.json())
            .then(data => { 
                if (data.feed) setFriendsFeed(data.feed); 
            })
            .catch(err => console.error("Error loading friends feed:", err));
    }, [authFetch]);

    const stats = useMemo(() => {
        if (history.length === 0) return null;

        const totalTests = history.length;
        const avgScore = history.reduce((s, h) => s + (h.percentage || 0), 0) / totalTests;
        const bestScore = Math.max(...history.map(h => h.percentage || 0));
        const totalTime = history.reduce((s, h) => s + (h.totalTime || 0), 0);

        // Topic aggregation
        const topics = {};
        history.forEach(h => {
            if (!h.topicBreakdown) return;
            let breakdownObj = h.topicBreakdown;
            if (typeof h.topicBreakdown === 'string') {
                try {
                    breakdownObj = JSON.parse(h.topicBreakdown);
                } catch (e) {
                    return;
                }
            }
            Object.entries(breakdownObj).forEach(([topic, data]) => {
                if (!topics[topic]) topics[topic] = { correct: 0, total: 0 };
                topics[topic].correct += data.correct;
                topics[topic].total += data.total;
            });
        });

        // Sort topics by total questions (desc)
        const topicList = Object.entries(topics)
            .map(([name, data]) => ({
                name,
                correct: data.correct,
                total: data.total,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10); // top 10 topics

        return { totalTests, avgScore, bestScore, totalTime, topicList };
    }, [history]);

    const formatDuration = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTimeAgo = (dateStr) => {
        const now = new Date();
        const past = new Date(dateStr);
        const diffMs = now - past;
        const diffMins = Math.max(0, Math.floor(diffMs / 60000));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        return `${diffDays}d ago`;
    };

    const handleClear = async () => {
        if (window.confirm('Clear all test history? This cannot be undone.')) {
            await authFetch('/api/history', { method: 'DELETE' });
            setHistory([]);
            // Reload page to refresh gamification stats
            window.location.reload();
        }
    };

    const handleDeleteTest = async (id) => {
        if (window.confirm('Delete this test from your history? This cannot be undone.')) {
            try {
                const res = await authFetch(`/api/history/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to delete test.');
                }
                setHistory(prev => prev.filter(h => h.id !== id));
                // Reload gamification stats to update xp/streak/calendar after deleting a test
                authFetch('/api/gamification/stats')
                    .then(r => r.json())
                    .then(data => { if (!data.error) setGamification(data); });
            } catch (err) {
                alert(err.message);
            }
        }
    };

    // SVG line chart data (last 15 tests, oldest-first)
    const chartData = useMemo(() => {
        const recent = history.slice(0, 15).reverse(); // oldest first for chart
        if (recent.length < 2) return null;

        const W = 500, H = 200, P = 30;
        const maxY = 100; // percentage
        const stepX = (W - P * 2) / (recent.length - 1);

        const points = recent.map((h, i) => ({
            x: P + i * stepX,
            y: P + (1 - (h.percentage || 0) / maxY) * (H - P * 2),
            pct: (h.percentage || 0).toFixed(0),
            date: formatDate(h.date || h.created_at),
        }));

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

        // Gradient fill area
        const areaD = pathD + ` L ${points[points.length - 1].x} ${H - P} L ${points[0].x} ${H - P} Z`;

        return { W, H, P, points, pathD, areaD, maxY };
    }, [history]);

    // Calculate level metrics
    const levelMetrics = useMemo(() => {
        if (!gamification) return null;
        const { xp, level, currentLevelMinXp, nextLevelXp } = gamification;
        const levelRange = nextLevelXp - currentLevelMinXp;
        const levelProgress = levelRange > 0 ? (xp - currentLevelMinXp) / levelRange : 0;
        return {
            xp,
            level,
            currentLevelMinXp,
            nextLevelXp,
            progressPercent: Math.min(100, Math.max(0, Math.floor(levelProgress * 100)))
        };
    }, [gamification]);

    // Readable badge key format
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

    if (loading) {
        return (
            <div className="dashboard-container animate-fade-in">
                <div className="loading-screen"><div className="loading-spinner" /></div>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="dashboard-container animate-fade-in">
                <div className="dashboard-header">
                    <h1>📈 Performance Dashboard</h1>
                    <p>Track your progress across tests</p>
                </div>
                <Card className="empty-state glass">
                    <BarChart3 size={48} className="text-secondary" />
                    <h3>No Test History Yet</h3>
                    <p>Complete some tests to see your performance trends and start earning XP/badges here!</p>
                    <Button variant="primary" onClick={() => navigate('/')}>Take a Test</Button>
                </Card>
                <div className="dashboard-back">
                    <Button variant="ghost" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container animate-fade-in">
            {/* Header */}
            <div className="dashboard-header">
                <h1>📈 Performance Dashboard</h1>
                <p>Track stats, levels, badges, and streaks in one place</p>
            </div>

            {/* Layout Grid */}
            <div className="dashboard-grid">
                
                {/* Left Side: Main Stats and Calendar */}
                <div className="dashboard-main-col">
                    
                    {/* Gamification Row (Level & Streak) */}
                    {gamification && levelMetrics && (
                        <div className="gamification-row">
                            {/* Level Progress Gauge */}
                            <Card className="level-card glass">
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
                                        <h3 className="lvl-header">Rank Progression</h3>
                                        <p className="xp-details">
                                            <Sparkles size={12} className="xp-icon" /> 
                                            <strong>{levelMetrics.xp} XP</strong> total
                                        </p>
                                        <div className="xp-progress-bar-bg">
                                            <div className="xp-progress-bar-fill" style={{ width: `${levelMetrics.progressPercent}%` }}></div>
                                        </div>
                                        <p className="xp-remaining">
                                            {levelMetrics.nextLevelXp - levelMetrics.xp} XP to Level {levelMetrics.level + 1}
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            {/* Streak Counter Card */}
                            <Card className="streak-card glass">
                                <div className="streak-flame-wrapper">
                                    <div className="streak-flame">
                                        <Flame size={48} className="flame-icon pulsing" />
                                    </div>
                                    <div className="streak-info">
                                        <h3 className="streak-header">Daily Streak</h3>
                                        <span className="streak-count">{gamification.streak} Day{gamification.streak !== 1 ? 's' : ''}</span>
                                        <p className="streak-message">
                                            {gamification.streak > 0 
                                                ? 'Great job! Test taken recently. Keep it burning!'
                                                : 'Start taking daily tests to build up a learning streak.'}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Classic Stats row */}
                    <div className="stats-row">
                        <Card className="stat-card glass">
                            <TrendingUp size={24} className="stat-icon" />
                            <div className="stat-content">
                                <span className="stat-number">{stats.avgScore.toFixed(1)}%</span>
                                <span className="stat-label">Avg Score</span>
                            </div>
                        </Card>
                        <Card className="stat-card glass">
                            <Award size={24} className="stat-icon gold" />
                            <div className="stat-content">
                                <span className="stat-number">{stats.bestScore.toFixed(0)}%</span>
                                <span className="stat-label">Best Score</span>
                            </div>
                        </Card>
                        <Card className="stat-card glass">
                            <Target size={24} className="stat-icon" />
                            <div className="stat-content">
                                <span className="stat-number">{stats.totalTests}</span>
                                <span className="stat-label">Tests Taken</span>
                            </div>
                        </Card>
                        <Card className="stat-card glass">
                            <Clock size={24} className="stat-icon" />
                            <div className="stat-content">
                                <span className="stat-number">{formatDuration(stats.totalTime)}</span>
                                <span className="stat-label">Total Time</span>
                            </div>
                        </Card>
                    </div>

                    {/* Contribution calendar grid */}
                    {gamification && (
                        <div className="calendar-section">
                            <ContributionCalendar activity={gamification.activity || {}} />
                        </div>
                    )}

                    {/* Score Trend Chart */}
                    {chartData && (
                        <Card className="chart-card glass">
                            <h3>Score Trend (Last {chartData.points.length} Tests)</h3>
                            <svg viewBox={`0 0 ${chartData.W} ${chartData.H}`} className="trend-chart">
                                {[0, 25, 50, 75, 100].map(pct => {
                                    const y = chartData.P + (1 - pct / 100) * (chartData.H - chartData.P * 2);
                                    return (
                                        <g key={pct}>
                                            <line x1={chartData.P} y1={y} x2={chartData.W - chartData.P} y2={y} className="grid-line" />
                                            <text x={chartData.P - 6} y={y + 4} className="axis-label" textAnchor="end">{pct}%</text>
                                        </g>
                                    );
                                })}
                                <defs>
                                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#5c6ac4" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="#5c6ac4" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <path d={chartData.areaD} fill="url(#areaGrad)" />
                                <path d={chartData.pathD} className="trend-line" />
                                {chartData.points.map((p, i) => (
                                    <g key={i}>
                                        <circle cx={p.x} cy={p.y} r="4" className="trend-dot" />
                                        <title>{p.date}: {p.pct}%</title>
                                    </g>
                                ))}
                            </svg>
                        </Card>
                    )}

                    {/* Badges Showcase Widget */}
                    {gamification?.badges && (
                        <Card className="badges-showcase-card glass">
                            <h3>Achievements Showcase</h3>
                            <p className="badges-subtitle">Unlock custom badges by scoring high, answering quickly, and setting streaks</p>
                            
                            <div className="badges-showcase-grid">
                                {gamification.badges.map((badge) => (
                                    <div 
                                        key={badge.key} 
                                        className={`badge-item-wrap ${badge.isUnlocked ? 'unlocked' : 'locked'}`}
                                    >
                                        <div className="badge-visual-container">
                                            <BadgeIcon badgeKey={badge.key} size={70} animated={badge.isUnlocked} />
                                            {!badge.isUnlocked && (
                                                <div className="badge-lock-shield">
                                                    <Lock size={16} className="lock-svg" />
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
                    )}

                    {/* Accuracy by Topic */}
                    {stats.topicList.length > 0 && (
                        <Card className="topics-card glass">
                            <h3>Accuracy by Topic</h3>
                            <div className="topic-bars">
                                {stats.topicList.map((t, i) => (
                                    <div key={i} className="topic-row">
                                        <span className="topic-name">{t.name}</span>
                                        <div className="topic-bar-bg">
                                            <div
                                                className="topic-bar-fill"
                                                style={{
                                                    width: `${t.accuracy}%`,
                                                    background: t.accuracy >= 70 ? 'var(--success)' : t.accuracy >= 40 ? '#fbbf24' : 'var(--danger)',
                                                }}
                                            ></div>
                                        </div>
                                        <span className="topic-stat">{t.correct}/{t.total} ({t.accuracy.toFixed(0)}%)</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Recent Tests Table */}
                    <Card className="recent-card glass">
                        <h3>Recent Tests</h3>
                        <div className="recent-table-wrap">
                            <table className="recent-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Score</th>
                                        <th>Marks</th>
                                        <th>Accuracy</th>
                                        <th>Time</th>
                                        <th style={{ textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.slice(0, 10).map((h, i) => (
                                        <tr key={i}>
                                            <td>{formatDate(h.date || h.created_at)}</td>
                                            <td>{h.correct}/{h.total}</td>
                                            <td className={h.totalMarks < 0 ? 'text-danger' : ''}>{h.totalMarks?.toFixed(1) || '—'}</td>
                                            <td>
                                                <span className={`pct-badge ${h.percentage >= 70 ? 'good' : h.percentage >= 40 ? 'avg' : 'low'}`}>
                                                    {(h.percentage || 0).toFixed(0)}%
                                                </span>
                                            </td>
                                            <td>{formatDuration(h.totalTime || 0)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleDeleteTest(h.id)}
                                                    title="Delete test from history"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--danger)',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '4px',
                                                        transition: 'background 0.2s',
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                </div>

                {/* Right Side: Sidebar for Lobby Actions and Friends Live Activity Feed */}
                <div className="dashboard-sidebar-col">
                    
                    {/* Quick multiplayer action card */}
                    <Card className="sidebar-action-card glass">
                        <Users size={28} className="sidebar-icon" />
                        <h3>Multiplayer Arena</h3>
                        <p>Challenge friends, conduct custom tests, or compete live in real time.</p>
                        <Button 
                            variant="primary" 
                            className="w-full flex-center gap-2" 
                            onClick={() => navigate('/')}
                        >
                            <Play size={14} fill="currentColor" /> Enter Lobby Setup
                        </Button>
                    </Card>

                    {/* Friends Activity Feed Card */}
                    <Card className="friends-feed-card glass">
                        <div className="friends-feed-header">
                            <Users size={20} className="friends-header-icon" />
                            <h3>Friends Activity Feed</h3>
                        </div>

                        <div className="feed-items-container">
                            {friendsFeed.length === 0 ? (
                                <div className="feed-empty">
                                    <p>No recent friends activity.</p>
                                    <p className="feed-empty-hint">Add friends from the lobby to see their accomplishments live!</p>
                                </div>
                            ) : (
                                friendsFeed.map((item) => (
                                    <div key={`${item.type}-${item.id}`} className="feed-item">
                                        {item.type === 'badge_unlock' ? (
                                            <div className="feed-item-badge">
                                                <div className="feed-item-visual">
                                                    <BadgeIcon badgeKey={item.badgeKey} size={36} animated={false} />
                                                </div>
                                                <div className="feed-item-desc">
                                                    <p className="feed-item-text">
                                                        <strong 
                                                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                            onClick={() => setActiveProfileQuery({ name: item.userName })}
                                                            title={`Click to view ${item.userName}'s profile`}
                                                        >
                                                            {item.userName}
                                                        </strong> unlocked the{' '}
                                                        <span className="badge-name-span">{getBadgeName(item.badgeKey)}</span> badge!
                                                    </p>
                                                    <span className="feed-item-time">{formatTimeAgo(item.date)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="feed-item-test">
                                                <div className="feed-test-icon-wrapper">
                                                    <Award size={18} className="feed-test-icon" />
                                                </div>
                                                <div className="feed-item-desc">
                                                    <p className="feed-item-text">
                                                        <strong 
                                                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                            onClick={() => setActiveProfileQuery({ name: item.userName })}
                                                            title={`Click to view ${item.userName}'s profile`}
                                                        >
                                                            {item.userName}
                                                        </strong> finished a{' '}
                                                        <strong>{item.examType ? item.examType.toUpperCase() : 'General'}</strong> test with{' '}
                                                        <span className="feed-pct-text">{item.percentage?.toFixed(0)}%</span>!
                                                    </p>
                                                    <span className="feed-item-time">{formatTimeAgo(item.date)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="dashboard-actions">
                <Button variant="ghost" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back to Setup</Button>
                <Button variant="primary" onClick={() => navigate('/profile')}>👤 Go to My Profile</Button>
                <Button variant="outline" onClick={handleClear} className="danger-btn"><Trash2 size={16} /> Clear History</Button>
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

export default Dashboard;
