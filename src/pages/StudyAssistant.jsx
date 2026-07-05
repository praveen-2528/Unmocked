import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAI } from '../context/AIContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChevronLeft, Sparkles, Send, Bot, User, Save, Trash2, X } from 'lucide-react';
import './StudyAssistant.css';

const StudyAssistant = () => {
    const navigate = useNavigate();
    const { generateResponse } = useAI();
    
    const [messages, setMessages] = useState(() => {
        const saved = localStorage.getItem('unmocked_ai_chat');
        return saved ? JSON.parse(saved) : [{ role: 'assistant', content: 'Hello! I am your AI Study Assistant. What topic would you like to learn about today?' }];
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const messagesEndRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('unmocked_ai_chat', JSON.stringify(messages));
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const systemPrompt = "You are an expert tutor for competitive exams. Be concise, clear, and helpful. Use markdown for formatting.";
            
            // Format previous context for better conversation
            let contextPrompt = '';
            const recentMessages = messages.slice(-4);
            if (recentMessages.length > 0) {
                contextPrompt = "Previous context:\n" + recentMessages.map(m => `${m.role}: ${m.content}`).join('\n') + "\n\nCurrent user query: " + userMsg;
            } else {
                contextPrompt = userMsg;
            }

            const response = await generateResponse(contextPrompt, systemPrompt);
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearChat = () => {
        if (window.confirm('Are you sure you want to clear the chat history?')) {
            setMessages([{ role: 'assistant', content: 'Hello! I am your AI Study Assistant. What topic would you like to learn about today?' }]);
        }
    };

    return (
        <div className="study-assistant-container animate-fade-in">
            <div className="sa-header">
                <div className="sa-title">
                    <Button variant="ghost" onClick={() => navigate('/')} style={{ padding: '0.5rem' }}>
                        <ChevronLeft size={20} />
                    </Button>
                    <h1><Sparkles size={24} className="text-primary" style={{ marginRight: '0.5rem' }} /> AI Study Assistant</h1>
                </div>
                <div className="sa-actions">
                    <Button variant="outline" onClick={handleClearChat} title="Clear Chat">
                        <Trash2 size={16} /> <span className="hide-mobile">Clear</span>
                    </Button>
                </div>
            </div>

            <Card className="sa-chat-box glass">
                <div className="sa-messages">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`sa-message-wrapper ${msg.role}`}>
                            <div className="sa-avatar">
                                {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                            </div>
                            <div className="sa-message-content">
                                {msg.content.split('\n').map((line, i) => (
                                    <p key={i}>{line}</p>
                                ))}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="sa-message-wrapper assistant">
                            <div className="sa-avatar"><Bot size={20} /></div>
                            <div className="sa-message-content typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                
                <div className="sa-input-area">
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask a question (e.g. Explain Newton's third law)..."
                        rows={1}
                        className="sa-textarea"
                    />
                    <Button variant="primary" onClick={handleSend} disabled={!input.trim() || isLoading} className="sa-send-btn">
                        <Send size={18} />
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default StudyAssistant;
