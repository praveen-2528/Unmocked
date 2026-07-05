import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, Share2, ArrowLeft, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import './GlobalLeaderboard.css';

const GlobalLeaderboard = () => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const { user, authFetch } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        fetch('/api/leaderboard')
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setLeaderboard(data.leaderboard || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load leaderboard');
                setLoading(false);
            });
    }, []);

    const handleShare = () => {
        const url = window.location.origin + '/leaderboard';
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleAddFriend = (targetId) => {
        if (!user) {
            navigate('/login');
            return;
        }
        authFetch('/api/friends/request', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: targetId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) alert(data.error);
            else alert('Friend request sent!');
        })
        .catch(err => alert('Failed to send request.'));
    };

    if (loading) return <div className="leaderboard-loading"><div className="spinner"></div></div>;

    return (
        <div className="glb-page animate-fade-in">
            <header className="glb-header">
                <Button variant="ghost" className="glb-back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} /> Back
                </Button>
                <div className="glb-title">
                    <Trophy size={32} className="text-yellow-400" />
                    <h1>Global Leaderboard</h1>
                </div>
                <Button variant="outline" className="glb-share-btn" onClick={handleShare}>
                    <Share2 size={16} /> {copied ? 'Copied Link!' : 'Share Link'}
                </Button>
            </header>

            {error && <div className="glb-error">{error}</div>}

            <Card className="glb-card glass">
                <div className="glb-table-container">
                    <table className="glb-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>Level</th>
                                <th>Total XP</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaderboard.map((player) => (
                                <tr key={player.id} className={user && user.id === player.id ? 'current-user-row' : ''}>
                                    <td className="glb-rank">
                                        {player.rank === 1 && <Crown size={20} className="rank-icon gold" />}
                                        {player.rank === 2 && <Medal size={20} className="rank-icon silver" />}
                                        {player.rank === 3 && <Medal size={20} className="rank-icon bronze" />}
                                        {player.rank > 3 && <span className="rank-number">{player.rank}</span>}
                                    </td>
                                    <td className="glb-name">
                                        {player.name}
                                        {user && user.id === player.id && <span className="glb-you-badge">YOU</span>}
                                    </td>
                                    <td className="glb-level">
                                        <div className="level-badge">Lvl {player.level}</div>
                                    </td>
                                    <td className="glb-xp">
                                        {player.xp.toLocaleString()} XP
                                    </td>
                                    <td className="glb-action">
                                        {user && user.id !== player.id && (
                                            <button 
                                                className="add-friend-btn" 
                                                onClick={() => handleAddFriend(player.id)}
                                                title="Send Friend Request"
                                            >
                                                <UserPlus size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {leaderboard.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="glb-empty">No players found yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default GlobalLeaderboard;
