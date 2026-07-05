import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Check, Eye } from 'lucide-react';
import QuestionRenderer from './QuestionRenderer';
import '../pages/Test.css'; // Reuse Test UI styles

const SolutionsView = ({ questions, answers, timeSpent, markingScheme, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reattemptMode, setReattemptMode] = useState(false);
    const [reattemptAnswers, setReattemptAnswers] = useState({});
    const [showSolution, setShowSolution] = useState(false);

    const q = questions[currentIndex];
    
    // Original answer stats
    const originalAnswer = answers[currentIndex];
    const isAttempted = originalAnswer !== undefined && originalAnswer !== -1 && originalAnswer !== '';
    const isCorrect = isAttempted && originalAnswer === q?.correctAnswer;
    
    // Average time calculation
    const allTimes = timeSpent.filter(t => t > 0);
    const avgTime = allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;
    const myTime = timeSpent[currentIndex] || 0;

    const formatTime = (seconds) => {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleOptionSelect = (optIdx) => {
        if (!reattemptMode) return;
        setReattemptAnswers(prev => ({ ...prev, [currentIndex]: optIdx }));
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setShowSolution(false);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setShowSolution(false);
        }
    };

    const toggleReattempt = () => {
        setReattemptMode(!reattemptMode);
        if (!reattemptMode) {
            setShowSolution(false); // Hide solution if turning reattempt on
        }
    };

    const getPaletteStatus = (idx) => {
        const ans = answers[idx];
        const isAnsAttempted = ans !== undefined && ans !== -1 && ans !== '';
        if (!isAnsAttempted) return 'not-answered';
        return ans === questions[idx].correctAnswer ? 'correct' : 'wrong';
    };

    // Derived classes based on reattempt / solution state
    const getOptionClass = (optIdx) => {
        let cls = 'option-item';
        
        if (showSolution || !reattemptMode) {
            // View Solution Mode: Show what the correct answer is, and what they picked
            if (optIdx === q?.correctAnswer) {
                cls += ' revealed-correct';
            } else if (originalAnswer === optIdx && !reattemptMode) {
                cls += ' revealed-wrong';
            } else if (reattemptMode && reattemptAnswers[currentIndex] === optIdx) {
                cls += ' revealed-wrong'; // they picked wrong in reattempt mode
            }
        } else if (reattemptMode) {
            // Re-attempt Mode Active: behaving like actual test
            if (reattemptAnswers[currentIndex] === optIdx) {
                cls += ' selected';
            }
        }
        
        if (reattemptMode && !showSolution) {
            cls += ' cursor-pointer';
        }

        return cls;
    };

    return (
        <div className="test-engine-container animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, background: 'var(--bg-color)' }}>
            <header className="te-top-header" style={{ position: 'relative' }}>
                <div className="te-header-left">
                    <button className="te-btn" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.5rem', background: 'transparent', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
                        <ChevronLeft size={16} /> Back to Summary
                    </button>
                    <div className="te-logo" style={{ marginLeft: '1rem' }}>
                        <h1>UnMocked</h1>
                        <span>SOLUTIONS</span>
                    </div>
                </div>
            </header>

            <div className="te-main-area">
                {/* Left Pane (Question & Explanation) */}
                <div className="te-left-pane">
                    <div className="te-question-header" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="te-question-no">Question No. {currentIndex + 1}</span>
                        
                        {!reattemptMode && (
                            <span style={{
                                padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                                background: !isAttempted ? 'rgba(156, 163, 175, 0.2)' : isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: !isAttempted ? '#9ca3af' : isCorrect ? '#10b981' : '#ef4444'
                            }}>
                                {!isAttempted ? 'Unattempted' : isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <Clock size={14} /> You: {formatTime(myTime)} | Avg: {formatTime(avgTime)}
                        </div>

                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.85rem' }}>Marks: <span style={{ color: '#10b981', fontWeight: 'bold' }}>+{markingScheme?.correct || 1}</span> <span style={{ color: '#ef4444' }}>-{markingScheme?.incorrect || 0}</span></span>
                        </div>
                    </div>

                    <div className="te-question-content" style={{ flex: 1, overflowY: 'auto' }}>
                        {q ? (
                            <>
                                <QuestionRenderer text={q.question_text || q.text || ''} />
                                
                                {q.image_url && (
                                    <div style={{ margin: '1rem 0' }}>
                                        <img src={q.image_url} alt="Question" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                                    </div>
                                )}

                                <div className="te-options-list">
                                    {q.options && q.options.map((opt, i) => (
                                        <div 
                                            key={i} 
                                            className={getOptionClass(i)}
                                            onClick={() => handleOptionSelect(i)}
                                            style={{
                                                cursor: (reattemptMode && !showSolution) ? 'pointer' : 'default',
                                                border: getOptionClass(i).includes('revealed-correct') ? '2px solid #10b981' : 
                                                        getOptionClass(i).includes('revealed-wrong') ? '2px solid #ef4444' : undefined,
                                                background: getOptionClass(i).includes('revealed-correct') ? 'rgba(16, 185, 129, 0.1)' : 
                                                            getOptionClass(i).includes('revealed-wrong') ? 'rgba(239, 68, 68, 0.1)' : undefined
                                            }}
                                        >
                                            <div className="option-marker">{String.fromCharCode(65 + i)}</div>
                                            <div className="option-text">{opt}</div>
                                            {getOptionClass(i).includes('revealed-correct') && <CheckCircle size={18} color="#10b981" style={{ marginLeft: 'auto' }} />}
                                            {getOptionClass(i).includes('revealed-wrong') && <XCircle size={18} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                                        </div>
                                    ))}
                                </div>

                                {showSolution && (
                                    <div className="explanation-box" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', borderRadius: '4px' }}>
                                        <h4 style={{ color: '#3b82f6', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Check size={18} /> Solution & Explanation
                                        </h4>
                                        <p style={{ lineHeight: '1.6', color: 'var(--text-primary)' }}>
                                            {q.explanation || "No detailed explanation provided for this question."}
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div>Loading question...</div>
                        )}
                    </div>
                    
                    {/* Bottom Action Bar inside Left Pane */}
                    <div className="te-action-bar" style={{ background: 'var(--card-bg)', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', padding: '10px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <button className="te-btn" onClick={handlePrev} disabled={currentIndex === 0}>
                                <ChevronLeft size={16} /> Previous
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: reattemptMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', transition: 'all 0.2s' }}>
                                <input 
                                    type="checkbox" 
                                    checked={reattemptMode} 
                                    onChange={toggleReattempt} 
                                    style={{ accentColor: '#10b981', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: reattemptMode ? '#10b981' : 'var(--text-secondary)' }}>Re-attempt Mode</span>
                            </label>
                            
                            {!showSolution && (
                                <button className="te-btn submit" onClick={() => setShowSolution(true)} style={{ background: 'var(--primary)', color: '#fff' }}>
                                    <Eye size={16} /> View Solution
                                </button>
                            )}

                            <button className="te-btn" onClick={handleNext} disabled={currentIndex === questions.length - 1}>
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Pane (Palette) */}
                <div className="te-right-pane">
                    <div className="te-palette-section" style={{ flex: 1, overflowY: 'auto' }}>
                        <div className="te-palette-header">
                            <h3>Question Palette</h3>
                        </div>
                        
                        <div className="te-palette-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '50%' }}></div> Correct
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%' }}></div> Incorrect
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <div style={{ width: '12px', height: '12px', background: 'var(--card-bg)', border: '1px solid var(--text-muted)', borderRadius: '50%' }}></div> Unattempted
                            </div>
                        </div>

                        <div className="te-palette-grid">
                            {questions.map((_, i) => {
                                const status = getPaletteStatus(i);
                                let bg = 'var(--card-bg)';
                                let color = 'var(--text-primary)';
                                let border = '1px solid var(--card-border)';

                                if (status === 'correct') {
                                    bg = '#10b981';
                                    color = 'white';
                                    border = '1px solid #059669';
                                } else if (status === 'wrong') {
                                    bg = '#ef4444';
                                    color = 'white';
                                    border = '1px solid #dc2626';
                                }

                                const isActive = i === currentIndex;

                                return (
                                    <button 
                                        key={i} 
                                        className="te-palette-btn"
                                        onClick={() => {
                                            setCurrentIndex(i);
                                            setShowSolution(false);
                                        }}
                                        style={{
                                            background: bg,
                                            color: color,
                                            border: border,
                                            transform: isActive ? 'scale(1.15)' : 'scale(1)',
                                            boxShadow: isActive ? '0 0 0 2px var(--bg-color), 0 0 0 4px var(--primary)' : 'none',
                                            transition: 'all 0.2s',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        {i + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SolutionsView;
