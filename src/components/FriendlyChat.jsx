import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, ChevronDown, Move, Maximize2, Users, Flame, Frown, Rocket, Skull, PartyPopper, Smile } from 'lucide-react';
import './FriendlyChat.css';

const FriendlyChat = ({ socket, roomCode, displayName, onUserClick, inline = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [unread, setUnread] = useState(0);
    const [popupMessages, setPopupMessages] = useState([]);
    const messagesEndRef = useRef(null);

    // Draggable position states
    const [pos, setPos] = useState(() => {
        // Position at bottom right by default
        return { x: window.innerWidth - 85, y: window.innerHeight - 85 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const pointerStartRef = useRef({ x: 0, y: 0 });
    const dragDistanceRef = useRef(0);

    // Ensure it correctly sets position on mount when window object is fully sized
    useEffect(() => {
        const timer = setTimeout(() => {
            setPos({ x: window.innerWidth - 85, y: window.innerHeight - 85 });
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Resizable panel size states
    const [chatSize, setChatSize] = useState({ width: 350, height: 460 });
    const [isResizing, setIsResizing] = useState(false);
    const resizeStartSizeRef = useRef({ width: 0, height: 0 });
    const resizeStartPointerRef = useRef({ x: 0, y: 0 });

    // Detect if bubble is in top/bottom or left/right half for smart panel layout
    const showBelow = pos.y < window.innerHeight / 2;
    const showRight = pos.x < window.innerWidth / 2;

    // Reposition bubble if viewport size changes
    useEffect(() => {
        const handleResize = () => {
            setPos(prev => {
                const newX = Math.max(10, Math.min(window.innerWidth - 75, prev.x));
                const newY = Math.max(10, Math.min(window.innerHeight - 75, prev.y));
                return { x: newX, y: newY };
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Listen to incoming messages
    useEffect(() => {
        if (!socket) return;

        const onChatMessage = (msg) => {
            setMessages(prev => [...prev, msg]);
            if (!isOpen && !inline) {
                setUnread(prev => prev + 1);
                // Trigger notification bubble next to chat head
                const popupMsg = { ...msg, id: Date.now() + Math.random() };
                setPopupMessages(prev => [...prev, popupMsg].slice(-3));
                // Auto dismiss popup in 5s
                setTimeout(() => {
                    setPopupMessages(prev => prev.filter(m => m.id !== popupMsg.id));
                }, 5000);
            }
        };

        socket.on('chatMessage', onChatMessage);
        return () => socket.off('chatMessage', onChatMessage);
    }, [socket, isOpen, inline]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    const handleSend = () => {
        const text = input.trim();
        if (!text || !socket) return;
        socket.emit('chatSend', { code: roomCode, text });
        setInput('');
    };

    const sendEmote = (emoteKey) => {
        if (!socket) return;
        socket.emit('sendEmote', { code: roomCode, emoteKey });
        // Auto-close chat popup if inline is false (so user can see the emote)
        // Or keep it open, let's keep it open.
    };

    const EmojiBar = () => (
        <div className="chat-emoji-bar">
            <button onClick={() => sendEmote('flame')} title="Fire"><Flame size={18} color="#f97316" /></button>
            <button onClick={() => sendEmote('frown')} title="Sad"><Frown size={18} color="#3b82f6" /></button>
            <button onClick={() => sendEmote('rocket')} title="Rocket"><Rocket size={18} color="#8b5cf6" /></button>
            <button onClick={() => sendEmote('skull')} title="Dead"><Skull size={18} color="#94a3b8" /></button>
            <button onClick={() => sendEmote('party')} title="Party"><PartyPopper size={18} color="#ec4899" /></button>
            <button onClick={() => sendEmote('smile')} title="Laugh"><Smile size={18} color="#eab308" /></button>
        </div>
    );

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const toggleOpen = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            setUnread(0);
            setPopupMessages([]);
        }
    };

    // --- Dragging Logic ---
    const onPointerDown = (e) => {
        if (isResizing) return;
        setIsDragging(true);
        dragStartRef.current = { x: pos.x, y: pos.y };
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
        dragDistanceRef.current = 0;
        e.target.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - pointerStartRef.current.x;
        const dy = e.clientY - pointerStartRef.current.y;
        dragDistanceRef.current = Math.sqrt(dx * dx + dy * dy);

        // Constrain dragging to window boundaries
        const newX = Math.max(10, Math.min(window.innerWidth - 75, dragStartRef.current.x + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 75, dragStartRef.current.y + dy));
        setPos({ x: newX, y: newY });
    };

    const onPointerUp = (e) => {
        setIsDragging(false);
        try {
            e.target.releasePointerCapture(e.pointerId);
        } catch (err) {}

        // If client tapped/clicked rather than dragged, toggle chat
        if (dragDistanceRef.current < 5) {
            toggleOpen();
        }
    };

    const handleDoubleClick = () => {
        // Reset position to default bottom right
        setPos({ x: window.innerWidth - 85, y: window.innerHeight - 85 });
    };

    // --- Resizing Logic ---
    const onResizePointerDown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        resizeStartSizeRef.current = { width: chatSize.width, height: chatSize.height };
        resizeStartPointerRef.current = { x: e.clientX, y: e.clientY };
        document.addEventListener('pointermove', onResizePointerMove);
        document.addEventListener('pointerup', onResizePointerUp);
    };

    const onResizePointerMove = (e) => {
        const dx = e.clientX - resizeStartPointerRef.current.x;
        const dy = e.clientY - resizeStartPointerRef.current.y;

        // X/Y calculations dynamically adjust based on window anchors
        let newWidth = resizeStartSizeRef.current.width + (showRight ? dx : -dx);
        let newHeight = resizeStartSizeRef.current.height + (showBelow ? dy : -dy);

        // Bounds constraints
        newWidth = Math.max(280, Math.min(600, newWidth));
        newHeight = Math.max(300, Math.min(700, newHeight));

        setChatSize({ width: newWidth, height: newHeight });
    };

    const onResizePointerUp = () => {
        setIsResizing(false);
        document.removeEventListener('pointermove', onResizePointerMove);
        document.removeEventListener('pointerup', onResizePointerUp);
    };

    // Get color avatar gradient based on username string hash
    const getAvatarGradient = (name) => {
        let hash = 0;
        const str = name || 'Anonymous';
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = [
            ['#6366f1', '#a5b4fc'], // Indigo
            ['#3b82f6', '#93c5fd'], // Blue
            ['#8b5cf6', '#c4b5fd'], // Purple
            ['#ec4899', '#fbcfe8'], // Pink
            ['#10b981', '#6ee7b7'], // Emerald
            ['#f59e0b', '#fde047'], // Amber
            ['#ef4444', '#fca5a5']  // Red
        ];
        const idx = Math.abs(hash) % colors.length;
        return `linear-gradient(135deg, ${colors[idx][0]} 0%, ${colors[idx][1]} 100%)`;
    };

    // Calculate smart positioning styles for popups & panel
    const bubbleStyle = {
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        touchAction: 'none',
        zIndex: 1005
    };

    const popupsStyle = {
        position: 'fixed',
        zIndex: 1000,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        alignItems: showRight ? 'flex-start' : 'flex-end',
        // Y offset: just above the bubble
        bottom: `${window.innerHeight - pos.y + 8}px`,
        // X offset: centered on bubble
        ...(showRight ? {
            left: `${pos.x}px`
        } : {
            right: `${window.innerWidth - pos.x - 55}px`
        })
    };

    const panelStyle = {
        position: 'fixed',
        width: `${chatSize.width}px`,
        height: `${chatSize.height}px`,
        zIndex: 1002,
        // Y positioning: open below or above bubble
        ...(showBelow ? {
            top: `${pos.y + 70}px`
        } : {
            bottom: `${window.innerHeight - pos.y + 10}px`
        }),
        // X positioning: align left or right
        ...(showRight ? {
            left: `${pos.x}px`
        } : {
            right: `${window.innerWidth - pos.x - 55}px`
        })
    };

    if (inline) {
        return (
            <div className="chat-inline-panel glass">
                <div className="chat-panel-header">
                    <div className="chat-header-info">
                        <span className="live-dot"></span>
                        <h4>Room Chat ({roomCode})</h4>
                    </div>
                </div>

                <div className="chat-messages-scroll">
                    {messages.length === 0 ? (
                        <div className="chat-empty-state">
                            <MessageSquare size={32} className="empty-icon text-secondary" />
                            <p>No messages yet.</p>
                            <span>Say hello to start the discussion! 👋</span>
                        </div>
                    ) : (
                        <div className="chat-messages-container">
                            {messages.map((msg, i) => {
                                const isMine = msg.sender === displayName;
                                return (
                                    <div key={i} className={`chat-message-row ${isMine ? 'mine' : ''}`}>
                                        {!isMine && (
                                            <div 
                                                className="msg-avatar" 
                                                style={{ background: getAvatarGradient(msg.sender) }}
                                                onClick={() => onUserClick && onUserClick({ name: msg.sender, email: msg.email })}
                                                title={`View ${msg.sender}'s profile`}
                                            >
                                                {msg.sender.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="msg-content-wrapper">
                                            {!isMine && (
                                                <span 
                                                    className="msg-sender"
                                                    onClick={() => onUserClick && onUserClick({ name: msg.sender, email: msg.email })}
                                                >
                                                    {msg.sender}
                                                </span>
                                            )}
                                            <div className="msg-bubble">
                                                <p>{msg.text}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                <EmojiBar />
                <div className="chat-input-row">
                    <input
                        type="text"
                        placeholder="Send a message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        maxLength={200}
                    />
                    <button 
                        className="chat-send-btn" 
                        onClick={handleSend} 
                        disabled={!input.trim()}
                        title="Send"
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Draggable Bubble Launcher */}
            <div
                className={`chat-bubble-launcher glass ${isOpen ? 'open' : ''} ${unread > 0 ? 'unread-pulse' : ''}`}
                style={bubbleStyle}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={handleDoubleClick}
                title="Double click to reset position"
            >
                <div className="launcher-icon">
                    <MessageSquare size={24} />
                </div>
                {unread > 0 && <span className="unread-badge animate-pop-in">{unread}</span>}
            </div>

            {/* Popup Notifications when closed */}
            {!isOpen && popupMessages.length > 0 && (
                <div style={popupsStyle} className="chat-popups-container">
                    {popupMessages.map(msg => (
                        <div key={msg.id} className="chat-popup-item glass animate-slide-in-right" style={{ pointerEvents: 'auto' }} onClick={toggleOpen}>
                            <div className="popup-avatar" style={{ background: getAvatarGradient(msg.sender) }}>
                                {msg.sender.charAt(0).toUpperCase()}
                            </div>
                            <div className="popup-msg-body">
                                <span className="popup-sender">{msg.sender}</span>
                                <span className="popup-text">{msg.text}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Redefined Chat Panel */}
            {isOpen && (
                <div style={panelStyle} className="chat-floating-panel glass animate-bounce-in">
                    {/* Corner Resize Handles */}
                    {/* Resizer is located opposite to the launch direction (top-left if bottom-right, etc.) */}
                    <div 
                        className={`chat-panel-resizer ${showBelow ? (showRight ? 'bottom-right' : 'bottom-left') : (showRight ? 'top-right' : 'top-left')}`}
                        onPointerDown={onResizePointerDown}
                        title="Drag to resize chat window"
                    >
                        <Maximize2 size={12} className="resizer-icon" />
                    </div>

                    {/* Chat Panel Header */}
                    <div className="chat-panel-header">
                        <div className="chat-header-info">
                            <span className="live-dot"></span>
                            <h4>Room Chat ({roomCode})</h4>
                        </div>
                        <div className="chat-header-actions">
                            <button className="chat-close-btn" onClick={toggleOpen}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="chat-messages-scroll">
                        {messages.length === 0 ? (
                            <div className="chat-empty-state">
                                <MessageSquare size={32} className="empty-icon text-secondary" />
                                <p>No messages yet.</p>
                                <span>Say hello to start the discussion! 👋</span>
                            </div>
                        ) : (
                            <div className="chat-messages-container">
                                {messages.map((msg, i) => {
                                    const isMine = msg.sender === displayName;
                                    return (
                                        <div key={i} className={`chat-message-row ${isMine ? 'mine' : ''}`}>
                                            {!isMine && (
                                                <div 
                                                    className="msg-avatar" 
                                                    style={{ background: getAvatarGradient(msg.sender) }}
                                                    onClick={() => onUserClick && onUserClick({ name: msg.sender, email: msg.email })}
                                                    title={`View ${msg.sender}'s profile`}
                                                >
                                                    {msg.sender.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="msg-content-wrapper">
                                                {!isMine && (
                                                    <span 
                                                        className="msg-sender"
                                                        onClick={() => onUserClick && onUserClick({ name: msg.sender, email: msg.email })}
                                                    >
                                                        {msg.sender}
                                                    </span>
                                                )}
                                                <div className="msg-bubble">
                                                    <p>{msg.text}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    <EmojiBar />
                    {/* Chat Input Area */}
                    <div className="chat-input-row">
                        <input
                            type="text"
                            placeholder="Send a message..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            maxLength={200}
                        />
                        <button 
                            className="chat-send-btn" 
                            onClick={handleSend} 
                            disabled={!input.trim()}
                            title="Send"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default FriendlyChat;
