import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChevronLeft, Trophy, Medal, Crown, Clock } from 'lucide-react';
import UserProfileModal from '../components/UserProfileModal';
import './GlobalLeaderboard.css';

const GlobalLeaderboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    useEffect(() => {
        fetch(`http://${window.location.hostname}:3001/api/leaderboard`)
            .then(r => r.json())
            .then(data => { setLeaderboard(data.leaderboard || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown size={18} className="rank-icon gold" />;
        if (rank === 2) return <Medal size={18} className="rank-icon silver" />;
        if (rank === 3) return <Medal size={18} className="rank-icon bronze" />;
        return <span className="rank-num">{rank}</span>;
    };

    if (loading) {
        return (
            <div className="gleaderboard-container animate-fade-in">
                <div className="loading-screen"><div className="loading-spinner" /></div>
            </div>
        );
    }

    return (
        <div className="gleaderboard-container animate-fade-in">
            <div className="gleaderboard-header">
                <h1><Trophy size={28} /> Global Leaderboard</h1>
                <p>Top performers across all users</p>
            </div>

            {leaderboard.length === 0 ? (
                <Card className="empty-state glass">
                    <Trophy size={48} className="text-secondary" />
                    <h3>No Rankings Yet</h3>
                    <p>Complete some tests to appear on the leaderboard!</p>
                    <Button variant="primary" onClick={() => navigate('/')}>Take a Test</Button>
                </Card>
            ) : (
                <>
                    {/* Podium (top 3) */}
                    {leaderboard.length >= 3 && (
                        <div className="podium">
                            {[1, 0, 2].map(i => {
                                const entry = leaderboard[i];
                                if (!entry) return null;
                                const rank = i + 1;
                                const isMe = user?.id === entry.id;
                                return (
                                    <div key={i} className={`podium-slot rank-${rank} ${isMe ? 'is-me' : ''}`}>
                                        <div className="podium-avatar">{entry.name.charAt(0).toUpperCase()}</div>
                                        <span 
                                            className="podium-name"
                                            style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                            onClick={() => setActiveProfileQuery({ email: entry.email, name: entry.name })}
                                            title={`Click to view ${entry.name}'s profile & exams`}
                                        >
                                            {entry.name}{isMe && ' (You)'}
                                        </span>
                                        <span className="podium-score">{entry.avg_score}%</span>
                                        <div className={`podium-bar bar-${rank}`}>{getRankIcon(rank === 0 ? 2 : rank === 2 ? 3 : rank)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Full Table */}
                    <Card className="rank-table-card glass">
                        <table className="rank-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Name</th>
                                    <th>Tests</th>
                                    <th>Avg Score</th>
                                    <th>Best</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((entry, i) => {
                                    const isMe = user?.id === entry.id;
                                    return (
                                        <tr key={entry.id} className={isMe ? 'is-me' : ''}>
                                            <td>{getRankIcon(i + 1)}</td>
                                            <td 
                                                style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                                onClick={() => setActiveProfileQuery({ email: entry.email, name: entry.name })}
                                                title={`Click to view ${entry.name}'s profile & exams`}
                                            >
                                                {entry.name}
                                                {isMe && <span className="you-badge">You</span>}
                                            </td>
                                            <td>{entry.tests_taken}</td>
                                            <td>
                                                <span className={`pct-badge ${entry.avg_score >= 70 ? 'good' : entry.avg_score >= 40 ? 'avg' : 'low'}`}>
                                                    {entry.avg_score}%
                                                </span>
                                            </td>
                                            <td>{entry.best_score}%</td>
                                            <td className="text-secondary">{formatTime(entry.total_time || 0)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Card>
                </>
            )}

            <div className="gleaderboard-back">
                <Button variant="ghost" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back</Button>
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

export default GlobalLeaderboard;
