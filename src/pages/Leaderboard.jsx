import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../context/RoomContext';
import { useExam } from '../context/ExamContext';
import { useAuth } from '../context/AuthContext';
import { useAI } from '../context/AIContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Trophy, Clock, ChevronLeft, Users, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, Eye, X, Award, Crown, Home, Share2 } from 'lucide-react';
import UserProfileModal from '../components/UserProfileModal';
import QuestionRenderer from '../components/QuestionRenderer';
import domtoimage from 'dom-to-image-more';
import './Leaderboard.css';
import './Results.css';

const Leaderboard = () => {
    const navigate = useNavigate();
    const { results, participants, totalParticipants, allSubmitted, roomCode, getLeaderboard, leaveRoom, isHost, socket } = useRoom();
    const { generateResponse } = useAI();
    const { questions } = useExam();
    const { user } = useAuth();
    const [expandedPlayer, setExpandedPlayer] = useState(null);
    const [viewingPlayer, setViewingPlayer] = useState(null); // full detail view
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);
    const [roastGenerated, setRoastGenerated] = useState(false);

    useEffect(() => {
        if (roomCode) {
            getLeaderboard().catch(() => { });
        }
    }, [roomCode, getLeaderboard]);

    // Generate Roast Report when everyone finishes
    useEffect(() => {
        if (allSubmitted && isHost && roomCode && socket && !roastGenerated && results.length > 0) {
            setRoastGenerated(true);
            
            // Announce that AI is working on it
            socket.emit('aiRoastMessage', { 
                code: roomCode, 
                text: "Analyzing match results and preparing the Roast Report... ⏳" 
            });

            // Construct prompt from results
            const sortedResults = [...results].sort((a, b) => b.score - a.score);
            const winner = sortedResults[0];
            const losers = sortedResults.slice(1);
            
            let prompt = `We just finished a multiplayer test. Here are the results:\n`;
            prompt += `Winner: ${winner.playerName} with a score of ${winner.score}/${winner.total} (${winner.correct} correct).\n`;
            if (losers.length > 0) {
                prompt += `Others:\n`;
                losers.forEach(l => {
                    prompt += `- ${l.playerName}: ${l.score}/${l.total} (${l.correct} correct, ${l.incorrect} incorrect).\n`;
                });
            }
            prompt += `\nWrite a funny, slightly roasting post-match analytics report announcing the winner and roasting the losers. Keep it short (under 150 words) and use emojis. Do not use Markdown formatting like bolding or asterisks. Act like a gaming announcer.`;

            generateResponse(prompt).then((roastText) => {
                if (roastText) {
                    socket.emit('aiRoastMessage', { 
                        code: roomCode, 
                        text: roastText 
                    });
                }
            }).catch(err => console.error("Failed to generate roast:", err));
        }
    }, [allSubmitted, isHost, roomCode, socket, roastGenerated, results, generateResponse]);

    const formatTotalTime = (seconds) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleRefresh = () => {
        if (roomCode) getLeaderboard().catch(() => { });
    };

    const handleNewTest = () => {
        leaveRoom();
        navigate('/');
    };

    const toggleExpand = (idx) => {
        setExpandedPlayer(expandedPlayer === idx ? null : idx);
    };

    const openFullResults = (r) => {
        setViewingPlayer(r);
    };

    const podiumColors = ['#fbbf24', '#94a3b8', '#cd7f32'];
    const podiumLabels = ['🥇', '🥈', '🥉'];

    // Heatmap helpers (for viewing another player's time)
    const getHeatColor = (time, avgTime) => {
        if (!time || time === 0) return 'var(--card-bg)';
        const ratio = time / avgTime;
        if (ratio < 0.5) return '#10b981';
        if (ratio < 1.0) return '#34d399';
        if (ratio < 1.5) return '#fbbf24';
        if (ratio < 2.5) return '#f97316';
        return '#ef4444';
    };

    const getHeatLabel = (time, avgTime) => {
        if (!time || time === 0) return 'Skipped';
        const ratio = time / avgTime;
        if (ratio < 0.5) return 'Fast';
        if (ratio < 1.0) return 'Normal';
        if (ratio < 1.5) return 'Average';
        if (ratio < 2.5) return 'Slow';
        return 'Very Slow';
    };

    // ── Full Player Results Detail View ──────────────────────────────
    if (viewingPlayer) {
        const r = viewingPlayer;
        const playerAnswers = r.answers || {};
        const playerTimeSpent = r.timeSpent || [];
        const unattempted = r.total - (r.correct + r.incorrect);
        const percentage = ((r.correct / r.total) * 100).toFixed(1);

        const allTimes = playerTimeSpent.filter(t => t > 0);
        const avgTime = allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;

        return (
            <div className="leaderboard-container animate-fade-in">
                {/* Header with back button */}
                <header className="detail-header glass">
                    <div className="detail-header-left">
                        <Button variant="ghost" onClick={() => setViewingPlayer(null)}>
                            <ChevronLeft size={16} /> Back to Leaderboard
                        </Button>
                    </div>
                    <div className="detail-header-right">
                        <Award size={20} />
                        <h2>{r.playerName}'s Results</h2>
                    </div>
                </header>

                {/* Score Summary Card */}
                <Card className="player-score-card glass">
                    <div className="player-score-circle">
                        <div className="player-score-value">{r.score}<span>/{r.total}</span></div>
                        <div className="player-score-pct">{percentage}%</div>
                    </div>
                    <div className="player-score-stats">
                        <div className="player-stat-box">
                            <span className="player-stat-label">Correct</span>
                            <span className="player-stat-value text-success">{r.correct}</span>
                        </div>
                        <div className="player-stat-box">
                            <span className="player-stat-label">Incorrect</span>
                            <span className="player-stat-value text-danger">{r.incorrect}</span>
                        </div>
                        <div className="player-stat-box">
                            <span className="player-stat-label">Skipped</span>
                            <span className="player-stat-value text-slate-400">{unattempted}</span>
                        </div>
                        <div className="player-stat-box">
                            <span className="player-stat-label">Total Time</span>
                            <span className="player-stat-value">{formatTotalTime(r.totalTime)}</span>
                        </div>
                    </div>
                </Card>

                {/* Time Heatmap */}
                {playerTimeSpent.length > 0 && (
                    <Card className="player-heatmap-card glass">
                        <h3 className="section-title">🌡️ Time Difficulty Heatmap</h3>
                        <p className="heatmap-subtitle">Color shows time spent vs average ({formatTotalTime(Math.round(avgTime))})</p>
                        <div className="heatmap-grid">
                            {questions.map((_, idx) => {
                                const time = playerTimeSpent[idx] || 0;
                                const userAnswer = playerAnswers[idx];
                                const isCorrect = userAnswer !== undefined && userAnswer === questions[idx].correctAnswer;
                                return (
                                    <div
                                        key={idx}
                                        className={`heatmap-cell ${userAnswer === undefined ? 'skipped' : ''}`}
                                        style={{ '--heat-color': getHeatColor(time, avgTime) }}
                                        title={`Q${idx + 1}: ${formatTotalTime(time)} — ${getHeatLabel(time, avgTime)}${userAnswer !== undefined ? (isCorrect ? ' ✅' : ' ❌') : ' (skipped)'}`}
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
                )}

                {/* Detailed Per-Question Review */}
                <div className="detailed-review">
                    <h3 className="section-title">📋 Detailed Answer Review</h3>
                    {questions.map((q, idx) => {
                        const userAnswer = playerAnswers[idx];
                        const isCorrect = userAnswer !== undefined && userAnswer === q.correctAnswer;
                        const isAttempted = userAnswer !== undefined;

                        return (
                            <Card key={idx} className={`review-card ${isAttempted ? (isCorrect ? 'correct-border' : 'incorrect-border') : 'skipped-border'}`}>
                                <div className="review-q-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span className="q-number">Question {idx + 1}</span>
                                        {playerTimeSpent[idx] > 0 && (
                                            <span className="q-time text-slate-400" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                                                <Clock size={14} /> {formatTotalTime(playerTimeSpent[idx] || 0)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="q-status">
                                        {!isAttempted && <span className="status-badge skipped">Skipped</span>}
                                        {isAttempted && isCorrect && <span className="status-badge correct"><CheckCircle size={14} /> Correct</span>}
                                        {isAttempted && !isCorrect && <span className="status-badge incorrect"><XCircle size={14} /> Incorrect</span>}
                                    </div>
                                </div>
                                <div className="review-q-text">
                                    <QuestionRenderer text={q.text} subject={q.subject} />
                                </div>

                                <div className="review-options">
                                    {q.options.map((opt, optIdx) => {
                                        let optClass = "review-opt ";
                                        if (optIdx === q.correctAnswer) optClass += "is-correct";
                                        else if (userAnswer === optIdx) optClass += "is-wrong";

                                        return (
                                            <div key={optIdx} className={optClass}>
                                                <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                                                <span className="opt-text">{opt}</span>
                                                {optIdx === q.correctAnswer && <CheckCircle className="opt-icon success" size={16} />}
                                                {userAnswer === optIdx && !isCorrect && <XCircle className="opt-icon danger" size={16} />}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="explanation-box">
                                    <h5>Explanation</h5>
                                    <p>{q.explanation}</p>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Build collective results list
    const collectiveResults = [...results];
    
    // Find participants who haven't submitted yet
    const pendingParticipants = (participants || []).filter(p => {
        if (p.email) {
            return !results.some(r => r.email === p.email);
        }
        return !results.some(r => r.playerName === p.name);
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

    const handleShare = async () => {
        const captureElement = document.getElementById('leaderboard-capture');
        if (!captureElement) return;
        
        try {
            // Use dom-to-image-more for perfect CSS rendering (gradients, shadows, dim text fix)
            const blob = await domtoimage.toBlob(captureElement, {
                bgcolor: '#0f172a', // match dark theme exactly
                filter: (node) => {
                    return node.id !== 'share-buttons-container' && node.id !== 'leaderboard-action-buttons';
                }
            });

            if (!blob) return;

            // Download the image
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `UnMocked-Leaderboard-${roomCode || 'Local'}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Copy to clipboard if supported
            try {
                if (navigator.clipboard && navigator.clipboard.write) {
                    const item = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([item]);
                    alert("Leaderboard photo saved to clipboard & downloaded!");
                } else {
                    alert("Leaderboard photo downloaded! (Clipboard copy not supported on this browser)");
                }
            } catch (err) {
                console.log("Clipboard write failed, but download succeeded:", err);
                alert("Leaderboard photo downloaded!");
            }
        } catch (error) {
            console.error("Failed to capture leaderboard:", error);
            alert("Failed to generate image.");
        }
    };

    // ── Main Leaderboard View ────────────────────────────────────────
    return (
        <div id="leaderboard-capture" className="leaderboard-container animate-fade-in" style={{ padding: '20px' }}>
            <div className="leaderboard-header">
                <h1><Trophy size={32} /> Leaderboard</h1>
                <p>
                    {allSubmitted
                        ? `All ${totalParticipants} participants have submitted!`
                        : `${results.length} of ${totalParticipants} submitted — waiting for others...`
                    }
                </p>
                {roomCode && (
                    <span className="room-badge">Room: {roomCode}</span>
                )}
                <div id="share-buttons-container" style={{ marginTop: '1rem', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <Button variant="secondary" onClick={handleShare} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem' }}>
                        <Share2 size={16} /> Share Leaderboard
                    </Button>
                </div>
            </div>

            {/* Podium for top 3 */}
            {results.length >= 1 && (
                <div className="podium-section" style={{ justifyContent: 'center' }}>
                    {results.slice(0, 3).map((r, idx) => (
                        <div key={idx} className={`podium-card podium-${idx + 1}`} style={{ '--podium-color': podiumColors[idx], position: 'relative' }}
                            onClick={() => r.answers && openFullResults(r)}
                        >
                            {idx === 0 && <Crown size={24} className="podium-crown text-amber winner-crown-anim" style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }} />}
                            <span className="podium-emoji">{podiumLabels[idx]}</span>
                            <h3 className="podium-name" style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setActiveProfileQuery({ email: r.email, name: r.playerName }); }} title={`View ${r.playerName}'s profile`}>{r.playerName}</h3>
                            <div className="podium-score">
                                {r.marks !== undefined ? r.marks : r.score}
                                <span>/{r.maxMarks !== undefined ? r.maxMarks : r.total}</span>
                            </div>
                            <div className="podium-score-sub" style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                                ({r.score}/{r.total} Correct)
                            </div>
                            <div className="podium-time"><Clock size={12} /> {formatTotalTime(r.totalTime)}</div>
                            {r.answers && <span className="view-results-hint"><Eye size={12} /> View Details</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* Full Table with Expandable Answer Breakdown */}
            <Card className="leaderboard-table-card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>Marks (Score)</th>
                            <th>Correct</th>
                            <th>Incorrect</th>
                            <th>Time</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {collectiveResults.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="empty-row">
                                    <Users size={24} />
                                    <span>Waiting for submissions...</span>
                                </td>
                            </tr>
                        ) : (
                            collectiveResults.map((r, idx) => {
                                if (r.isPending) {
                                    return (
                                        <tr key={`pending-${idx}`} className="pending-row">
                                            <td className="rank-cell">-</td>
                                            <td className="name-cell" style={{ textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); setActiveProfileQuery({ email: r.email, name: r.playerName }); }} title={`Click to view ${r.playerName}'s profile`}>
                                                {r.playerName}
                                                <span className="status-badge-inline" style={{
                                                    marginLeft: '0.75rem',
                                                    fontSize: '0.65rem',
                                                    fontWeight: '700',
                                                    padding: '0.15rem 0.4rem',
                                                    borderRadius: '4px',
                                                    background: r.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: r.connected ? '#34d399' : '#f87171'
                                                }}>
                                                    {r.connected ? '✍️ Testing...' : '❌ Offline'}
                                                </span>
                                            </td>
                                            <td className="score-cell">-</td>
                                            <td className="correct-cell">-</td>
                                            <td className="incorrect-cell">-</td>
                                            <td className="time-cell">-</td>
                                            <td className="expand-cell"></td>
                                        </tr>
                                    );
                                }

                                return (
                                    <React.Fragment key={idx}>
                                        <tr className={`${idx < 3 ? `top-${idx + 1}` : ''} ${expandedPlayer === idx ? 'expanded-row' : ''}`}
                                            onClick={() => r.answers && toggleExpand(idx)}
                                            style={{ cursor: r.answers ? 'pointer' : 'default' }}
                                        >
                                            <td className="rank-cell">
                                                {idx < 3 ? podiumLabels[idx] : idx + 1}
                                            </td>
                                            <td className="name-cell" style={{ textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); setActiveProfileQuery({ email: r.email, name: r.playerName }); }} title={`Click to view ${r.playerName}'s profile & exams`}>
                                                {idx === 0 && <Crown size={15} className="text-amber winner-crown-anim" style={{ marginRight: '0.4rem', verticalAlign: 'middle', display: 'inline' }} />}
                                                {r.playerName}
                                            </td>
                                            <td className="score-cell">
                                                <strong>{r.marks !== undefined ? r.marks : r.score}</strong>/{r.maxMarks !== undefined ? r.maxMarks : r.total}
                                                <span className="pct" style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8, marginTop: '0.1rem' }}>
                                                    ({r.score}/{r.total} Correct)
                                                </span>
                                            </td>
                                            <td className="correct-cell">{r.correct}</td>
                                            <td className="incorrect-cell">{r.incorrect}</td>
                                            <td className="time-cell">{formatTotalTime(r.totalTime)}</td>
                                            <td className="expand-cell">
                                                {r.answers && (
                                                    <div className="expand-actions">
                                                        <button className="view-full-btn" onClick={(e) => { e.stopPropagation(); openFullResults(r); }} title="View full results">
                                                            <Eye size={14} />
                                                        </button>
                                                        {expandedPlayer === idx
                                                            ? <ChevronUp size={16} />
                                                            : <ChevronDown size={16} />
                                                        }
                                                    </div>
                                                )}
                                            </td>
                                        </tr>

                                        {/* Expanded Answer Breakdown Row */}
                                        {expandedPlayer === idx && r.answers && (
                                            <tr className="answer-breakdown-row animate-fade-in">
                                                <td colSpan={7}>
                                                    <div className="answer-breakdown">
                                                        <div className="breakdown-header">
                                                            <h4 className="breakdown-title">📋 {r.playerName}'s Answer Breakdown</h4>
                                                            <button className="full-results-link" onClick={() => openFullResults(r)}>
                                                                <Eye size={14} /> View Full Results →
                                                            </button>
                                                        </div>
                                                        <div className="answer-grid">
                                                            {questions.map((q, qIdx) => {
                                                                const userAns = r.answers[qIdx];
                                                                const isCorrect = userAns !== undefined && userAns === q.correctAnswer;
                                                                const isUnanswered = userAns === undefined;
                                                                return (
                                                                    <div key={qIdx}
                                                                        className={`answer-cell ${isUnanswered ? 'skipped' : isCorrect ? 'correct' : 'wrong'}`}
                                                                        title={`Q${qIdx + 1}: ${isUnanswered ? 'Skipped' : `Picked ${String.fromCharCode(65 + userAns)} — ${isCorrect ? 'Correct' : 'Wrong (Ans: ' + String.fromCharCode(65 + q.correctAnswer) + ')'}`}`}
                                                                    >
                                                                        <span className="answer-cell-num">{qIdx + 1}</span>
                                                                        <span className="answer-cell-icon">
                                                                            {isUnanswered ? '⬜' : isCorrect ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                                                        </span>
                                                                        {!isUnanswered && (
                                                                            <span className="answer-cell-pick">{String.fromCharCode(65 + userAns)}</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </Card>

            <div id="leaderboard-action-buttons" className="leaderboard-actions">
                <Button variant="ghost" onClick={() => {
                    if (user) {
                        const myResult = collectiveResults.find(r => r.email === user.email || r.playerName === user.name);
                        if (myResult && myResult.answers) {
                            openFullResults(myResult);
                            return;
                        }
                    }
                    // Fallback to navigating if we couldn't find local results
                    navigate('/results');
                }}>
                    <Eye size={16} /> My Results
                </Button>
                {!allSubmitted && (
                    <Button variant="outline" onClick={handleRefresh}>
                        <RefreshCw size={16} /> Refresh
                    </Button>
                )}
                <Button variant="primary" onClick={handleNewTest}>
                    New Test
                </Button>
                <Button variant="outline" onClick={() => { leaveRoom(); navigate('/'); }}>
                    <Home size={16} /> Home
                </Button>
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

export default Leaderboard;
