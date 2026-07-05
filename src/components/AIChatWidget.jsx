import React, { useState, useRef, useEffect } from 'react';
import { useAI } from '../context/AIContext';
import { Sparkles, Send, Bot, User, Trash2, Square, Maximize, Minimize, Image, X, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import './AIChatWidget.css';

const AIChatWidget = ({ height = '500px', user = null, history = [] }) => {
    const { generateResponse } = useAI();
    
    const [messages, setMessages] = useState([]);

    // Load initial messages for the specific user
    useEffect(() => {
        const key = `unmocked_ai_chat_${user?.email || 'guest'}`;
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                setMessages(JSON.parse(saved));
            } else {
                setMessages([{ role: 'assistant', content: `Hello ${user?.name || ''}! I am your AI Study Assistant. What topic would you like to learn about today?` }]);
            }
        } catch (e) {
            setMessages([{ role: 'assistant', content: `Hello ${user?.name || ''}! I am your AI Study Assistant. What topic would you like to learn about today?` }]);
        }
    }, [user?.email, user?.name]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    const chatContainerRef = useRef(null);
    const abortControllerRef = useRef(null);

    
    const [attachedImages, setAttachedImages] = useState([]);
    const fileInputRef = useRef(null);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachedImages(prev => [...prev, reader.result]);
            };
            reader.readAsDataURL(file);
        });
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeImage = (index) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    };


    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    useEffect(() => {
        const key = `unmocked_ai_chat_${user?.email || 'guest'}`;
        if (messages.length > 0) {
            localStorage.setItem(key, JSON.stringify(messages));
        }
        if (chatContainerRef.current) {
            // Use setTimeout to ensure DOM has updated
            setTimeout(() => {
                if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                }
            }, 50);
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        const currentImages = [...attachedImages];
        setInput('');
        setAttachedImages([]);
        setMessages(prev => [...prev, { role: 'user', content: userMsg, images: currentImages }]);
        setIsLoading(true);
        abortControllerRef.current = new AbortController();

        try {
            let contextPrompt = '';
            const recentMessages = messages.slice(-4);
            if (recentMessages.length > 0) {
                contextPrompt = "Previous context:\n" + recentMessages.map(m => `${m.role}: ${m.content}`).join('\n') + "\n\nCurrent user query: " + userMsg;
            } else {
                contextPrompt = userMsg;
            }

            let systemPrompt = "You are a personal chat friend. You love to playfully roast the user and use casual, funny language. Keep it lighthearted but definitely tease them a bit when they ask questions. Use markdown for formatting. IMPORTANT: You MUST use LaTeX for ALL math formulas, symbols, and equations. Wrap inline math in single $ signs (e.g. $E=mc^2$) and block math in double $ signs (e.g. $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$). Do NOT use raw Unicode characters (like √ or ±) or HTML tags (like <sub>).";
            
            // Inject dynamic user context
            let userContext = `\n\n--- USER CONTEXT ---\n`;
            if (user) {
                userContext += `Name: ${user.name}\n`;
                if (user.role) userContext += `Role: ${user.role}\n`;
            }
            if (history && history.length > 0) {
                const recentTests = history.slice(0, 3);
                userContext += `Recent Test Results:\n`;
                recentTests.forEach(test => {
                    const score = test.score || 0;
                    const total = test.totalScore || test.totalQuestions || 0;
                    userContext += `- Exam: ${test.examType}, Score: ${score}/${total}, Date: ${new Date(test.timestamp).toLocaleDateString()}\n`;
                    if (test.topicPerformance) {
                        userContext += `  Topic Performance: ${JSON.stringify(test.topicPerformance)}\n`;
                    }
                });
            } else {
                userContext += `No recent test history available.\n`;
            }
            userContext += `--- END USER CONTEXT ---\n`;
            
            

            contextPrompt += "\n\n" + userContext + "\n(Use the above test history to roast them if appropriate!)";
            
            // Append empty assistant message for streaming
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            const onChunk = (chunkText) => {
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    newMessages[newMessages.length - 1] = {
                        ...lastMsg,
                        content: lastMsg.content + chunkText
                    };
                    return newMessages;
                });
            };

            const apiImages = currentImages.map(img => img.split(',')[1]);
            await generateResponse(contextPrompt, systemPrompt, apiImages, onChunk, abortControllerRef.current.signal);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Generation stopped by user.");
                return;
            }
            
            setMessages(prev => {
                const newMsgs = [...prev];
                const last = newMsgs[newMsgs.length - 1];
                if (last.role === 'assistant' && !last.content) {
                    newMsgs.pop();
                }
                return [...newMsgs, { role: 'assistant', content: `❌ Error: ${error.message}` }];
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearChat = () => {
        if (window.confirm('Are you sure you want to clear the chat history?')) {
            setMessages([{ role: 'assistant', content: 'Hello! I am your AI Study Assistant. What topic would you like to learn about today?' }]);
        }
    };

    const renderMessageContent = (content) => {
        if (!content) return null;
        
        const renderText = (text) => {
            return (
                <div className="markdown-body">
                    <ReactMarkdown 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                    >
                        {text}
                    </ReactMarkdown>
                </div>
            );
        };

        return <div className="message-parsed-content">{renderText(content)}</div>;
    };

    return (
        <>
            {isExpanded && <div className="chat-expanded-backdrop" onClick={() => setIsExpanded(false)}></div>}
            <div className={`ai-chat-widget glass ${isExpanded ? 'chat-expanded' : ''}`} style={isExpanded ? {} : { height }}>
            <div className="chat-header">
                <div className="chat-title-group">
                    <div className="chat-icon-wrapper">
                        <Sparkles size={18} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="chat-title">AI Study Assistant</h3>
                        <span className="chat-subtitle">Powered by Local LLM</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="chat-clear-btn" title={isExpanded ? "Minimize" : "Full Screen"}>
                        {isExpanded ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>
                    <button onClick={handleClearChat} className="chat-clear-btn" title="Clear Chat">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="chat-messages-area" ref={chatContainerRef}>
                {messages.filter(msg => msg.content).map((msg, idx) => (
                    <div key={idx} className={`chat-bubble-row ${msg.role}`}>
                        <div className="chat-avatar">
                            {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                        </div>
                        <div className="chat-bubble-content">
                            {renderMessageContent(msg.content)}
                        </div>
                    </div>
                ))}
                {isLoading && messages[messages.length - 1]?.content === '' && (
                    <div className="chat-bubble-row assistant">
                        <div className="chat-avatar"><Bot size={16} /></div>
                        <div className="chat-bubble-content typing-indicator">
                            <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                        </div>
                    </div>
                )}
                
                {messages.length <= 1 && !isLoading && (
                    <div className="ai-quick-actions">
                        <p className="quick-actions-title">Suggested prompts:</p>
                        <div className="quick-actions-list">
                            <button className="quick-action-chip" onClick={() => setInput('Explain the Quadratic Formula')}>✨ Explain the Quadratic Formula</button>
                            <button className="quick-action-chip" onClick={() => setInput('Generate 5 Algebra questions')}>📝 Generate 5 Algebra questions</button>
                            <button className="quick-action-chip" onClick={() => setInput('Summarize my weaknesses')}>📊 Summarize my weaknesses</button>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="chat-input-area">
                {attachedImages.length > 0 && (
                    <div className="chat-image-preview-strip">
                        {attachedImages.map((img, i) => (
                            <div key={i} className="chat-image-preview-item">
                                <img src={img} alt="preview" />
                                <button className="remove-image-btn" onClick={() => removeImage(i)}><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="chat-input-row" style={{ display: 'flex', width: '100%', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <input type="file" accept="image/*" multiple hidden ref={fileInputRef} onChange={handleImageUpload} />
                    <button className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach Image">
                        <Image size={20} />
                    </button>

                    <textarea 
                        className="chat-textarea"
                        style={{ flex: 1 }}
                    placeholder="Ask a doubt or concept..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    rows={1}
                />
                {isLoading ? (
                    <button onClick={handleStop} className="chat-send-btn stop-btn" title="Stop generating" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                        <Square size={16} fill="currentColor" />
                    </button>
                ) : (
                    <button onClick={handleSend} disabled={!input.trim()} className="chat-send-btn" title="Send message">
                        <Send size={18} />
                    </button>
                )}
                </div>
            </div>
        </div>
        </>
    );
};

export default AIChatWidget;
