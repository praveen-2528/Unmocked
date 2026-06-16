import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { UserPlus, Users, ChevronLeft, Check, X, BarChart3, Clock, Trophy, Mail, Search, Loader } from 'lucide-react';
import UserProfileModal from '../components/UserProfileModal';
import './Friends.css';

const Friends = () => {
    const navigate = useNavigate();
    const { authFetch } = useAuth();
    const [friends, setFriends] = useState([]);
    const [pending, setPending] = useState([]);
    const [sent, setSent] = useState([]);
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [friendStats, setFriendStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    const loadFriends = useCallback(async () => {
        try {
            const res = await authFetch('/api/friends');
            const data = await res.json();
            setFriends(data.friends || []);
            setPending(data.pending || []);
            setSent(data.sent || []);
        } catch { }
    }, [authFetch]);

    useEffect(() => { loadFriends(); }, [loadFriends]);

    const handleSendRequest = async () => {
        setError('');
        setSuccess('');
        if (!email.trim()) return setError('Enter an email address.');
        setLoading(true);
        try {
            const res = await authFetch('/api/friends/request', {
                method: 'POST',
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess('Friend request sent!');
            setEmail('');
            loadFriends();
        } catch (err) { setError(err.message); }
        setLoading(false);
    };

    const handleAccept = async (id) => {
        try {
            await authFetch(`/api/friends/accept/${id}`, { method: 'POST' });
            loadFriends();
        } catch { }
    };

    const handleRemove = async (id) => {
        if (!window.confirm('Remove this friend?')) return;
        try {
            await authFetch(`/api/friends/${id}`, { method: 'DELETE' });
            setSelectedFriend(null);
            setFriendStats(null);
            loadFriends();
        } catch { }
    };

    const loadStats = async (friend) => {
        setSelectedFriend(friend);
        setStatsLoading(true);
        try {
            const res = await authFetch(`/api/friends/${friend.friendUserId}/stats`);
            const data = await res.json();
            setFriendStats(data);
        } catch { setFriendStats(null); }
        setStatsLoading(false);
    };

    const formatTime = (seconds) => {
        if (!seconds) return '0m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div className="friends-container animate-fade-in">
            <header className="friends-header">
                <div className="friends-header-left">
                    <Button variant="ghost" onClick={() => navigate('/')}>
                        <ChevronLeft size={16} />
                    </Button>
                    <h1><Users size={28} /> Friends</h1>
                </div>
            </header>

            <div className="friends-layout">
                {/* Left: Friends List & Add */}
                <div className="friends-list-panel">
                    {/* Add Friend */}
                    <Card className="add-friend-card">
                        <h3><UserPlus size={18} /> Add Friend</h3>
                        <div className="add-friend-form">
                            <div className="add-friend-input-row">
                                <Mail size={16} className="input-icon" />
                                <input
                                    type="email"
                                    placeholder="Friend's email address"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSendRequest()}
                                />
                                <Button variant="primary" onClick={handleSendRequest} disabled={loading}>
                                    {loading ? <Loader size={16} className="spin" /> : <UserPlus size={16} />}
                                </Button>
                            </div>
                            {error && <div className="friends-error">{error}</div>}
                            {success && <div className="friends-success">{success}</div>}
                        </div>
                    </Card>

                    {/* Pending Requests */}
                    {pending.length > 0 && (
                        <Card className="pending-card">
                            <h3>📬 Pending Requests ({pending.length})</h3>
                            <div className="pending-list">
                                {pending.map(p => (
                                    <div key={p.friendshipId} className="pending-item animate-fade-in">
                                        <div className="pending-info">
                                            <span className="pending-name">{p.fromName}</span>
                                            <span className="pending-email">{p.fromEmail}</span>
                                        </div>
                                        <div className="pending-actions">
                                            <button className="accept-btn" onClick={() => handleAccept(p.friendshipId)}>
                                                <Check size={16} />
                                            </button>
                                            <button className="reject-btn" onClick={() => handleRemove(p.friendshipId)}>
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Sent Requests */}
                    {sent.length > 0 && (
                        <Card className="sent-card">
                            <h3>📤 Sent Requests ({sent.length})</h3>
                            <div className="pending-list">
                                {sent.map(s => (
                                    <div key={s.friendshipId} className="pending-item sent">
                                        <div className="pending-info">
                                            <span className="pending-name">{s.toName}</span>
                                            <span className="pending-email">{s.toEmail}</span>
                                        </div>
                                        <span className="sent-badge">Pending</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Friends List */}
                    <Card className="friends-list-card">
                        <h3>👥 My Friends ({friends.length})</h3>
                        {friends.length === 0 ? (
                            <div className="empty-friends">
                                <Users size={40} className="empty-icon" />
                                <p>No friends yet. Add someone by email!</p>
                            </div>
                        ) : (
                            <div className="friends-list">
                                {friends.map(f => (
                                    <div key={f.friendshipId}
                                        className={`friend-item ${selectedFriend?.friendshipId === f.friendshipId ? 'selected' : ''}`}
                                        onClick={() => loadStats(f)}
                                    >
                                        <div className="friend-avatar">
                                            {f.friendName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="friend-info">
                                            <span className="friend-name">{f.friendName}</span>
                                            <span className="friend-email">{f.friendEmail}</span>
                                        </div>
                                        <BarChart3 size={16} className="friend-stats-icon" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right: Friend Stats Panel */}
                <div className="friend-stats-panel">
                    {!selectedFriend ? (
                        <Card className="stats-placeholder">
                            <Search size={40} className="placeholder-icon" />
                            <p>Select a friend to view their stats</p>
                        </Card>
                    ) : statsLoading ? (
                        <Card className="stats-placeholder">
                            <Loader size={32} className="spin" />
                            <p>Loading stats...</p>
                        </Card>
                    ) : friendStats ? (
                        <div className="stats-content animate-fade-in">
                            <Card className="stats-header-card">
                                <div className="stats-user-info">
                                    <div className="stats-avatar">
                                        {friendStats.user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 
                                            style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                            onClick={() => setActiveProfileQuery({ email: friendStats.user.email, name: friendStats.user.name })}
                                            title={`Click to view ${friendStats.user.name}'s profile & exams`}
                                        >
                                            {friendStats.user.name}
                                        </h2>
                                        <span className="stats-email">{friendStats.user.email}</span>
                                    </div>
                                </div>
                                <Button variant="ghost" className="remove-btn" onClick={() => handleRemove(selectedFriend.friendshipId)}>
                                    <X size={14} /> Remove
                                </Button>
                            </Card>

                            <div className="stats-grid">
                                <Card className="stat-card">
                                    <Trophy size={20} className="stat-icon gold" />
                                    <div className="stat-value">{friendStats.stats.bestScore ?? 0}%</div>
                                    <div className="stat-label">Best Score</div>
                                </Card>
                                <Card className="stat-card">
                                    <BarChart3 size={20} className="stat-icon blue" />
                                    <div className="stat-value">{friendStats.stats.avgScore ?? 0}%</div>
                                    <div className="stat-label">Avg Score</div>
                                </Card>
                                <Card className="stat-card">
                                    <Users size={20} className="stat-icon green" />
                                    <div className="stat-value">{friendStats.stats.testsTaken}</div>
                                    <div className="stat-label">Tests Taken</div>
                                </Card>
                                <Card className="stat-card">
                                    <Clock size={20} className="stat-icon purple" />
                                    <div className="stat-value">{formatTime(friendStats.stats.totalTime)}</div>
                                    <div className="stat-label">Total Time</div>
                                </Card>
                            </div>

                            {friendStats.recentTests.length > 0 && (
                                <Card className="recent-tests-card">
                                    <h3>📊 Recent Tests</h3>
                                    <div className="recent-tests-list">
                                        {friendStats.recentTests.map((t, i) => (
                                            <div key={i} className="recent-test-item">
                                                <div className="recent-test-info">
                                                    <span className="recent-exam-type">{t.exam_type?.toUpperCase()}</span>
                                                    {t.is_multiplayer ? <span className="mp-badge">🏠 MP</span> : null}
                                                </div>
                                                <div className="recent-test-score">
                                                    <strong>{t.score}/{t.total}</strong>
                                                    <span className="recent-pct">({t.percentage}%)</span>
                                                </div>
                                                <div className="recent-test-time">
                                                    <Clock size={12} /> {formatTime(t.total_time)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <Card className="stats-placeholder">
                            <p>Could not load stats.</p>
                        </Card>
                    )}
                </div>
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

export default Friends;
