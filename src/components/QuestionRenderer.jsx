import React from 'react';
import { parseQuestionText } from '../utils/csvParser';
import './QuestionRenderer.css';

const QuestionRenderer = ({ text }) => {
    const parsed = parseQuestionText(text);

    if (parsed.type === 'syllogism') {
        const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        return (
            <div className="q-renderer q-syllogism animate-fade-in">
                {parsed.direction && <p className="q-direction">{parsed.direction}</p>}
                
                <div className="q-syllogism-layout">
                    <div className="q-syllogism-card glass">
                        <span className="q-card-title">📝 Statements</span>
                        <ul className="q-statement-list">
                            {parsed.statements.map((stmt, idx) => (
                                <li key={idx} className="q-item">
                                    <span className="q-marker">{idx + 1}.</span>
                                    <span className="q-content">{stmt}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="q-syllogism-card glass">
                        <span className="q-card-title">🎯 Conclusions</span>
                        <ul className="q-conclusion-list">
                            {parsed.conclusions.map((conc, idx) => (
                                <li key={idx} className="q-item">
                                    <span className="q-marker roman">{romanNumerals[idx] || (idx + 1)}.</span>
                                    <span className="q-content">{conc}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {parsed.prompt && <p className="q-prompt">{parsed.prompt}</p>}
            </div>
        );
    }



    if (parsed.type === 'multiline-statements') {
        return (
            <div className="q-renderer q-multiline animate-fade-in">
                {parsed.direction && <p className="q-direction">{parsed.direction}</p>}
                
                <div className="q-statements-grid">
                    {parsed.statements.map((stmt, idx) => (
                        <div key={idx} className="q-stmt-row glass">
                            <span className="q-stmt-label">{stmt.label}</span>
                            <span className="q-stmt-content">{stmt.content}</span>
                        </div>
                    ))}
                </div>

                {parsed.prompt && <p className="q-prompt">{parsed.prompt}</p>}
            </div>
        );
    }

    // Default plain text rendering (maintaining format with newlines)
    return (
        <div className="q-renderer q-plain animate-fade-in">
            {text.split('\n').map((line, idx) => {
                if (!line.trim()) return <div key={idx} className="q-spacer" />;
                
                // Check if line starts with a list indicator
                const listMatch = line.match(/^(\d+\.|\*|-|\u2022|\([0-9a-zA-Z]+\))\s*(.*)/);
                if (listMatch) {
                    return (
                        <div key={idx} className="q-plain-list-item">
                            <span className="q-bullet">{listMatch[1]}</span>
                            <span className="q-bullet-text">{listMatch[2]}</span>
                        </div>
                    );
                }
                return <p key={idx} className="q-plain-paragraph">{line}</p>;
            })}
        </div>
    );
};

export default QuestionRenderer;
