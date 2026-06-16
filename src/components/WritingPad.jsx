import React, { useRef, useState, useEffect, useCallback, forwardRef } from 'react';
import { Pencil, Eraser, Undo2, Redo2, Trash2, Minus, Plus, Maximize2, Minimize2, X, Eye, GripHorizontal } from 'lucide-react';
import './WritingPad.css';

const COLORS = ['#ffffff', '#a5b4fc', '#f87171', '#4ade80', '#facc15', '#fb923c', '#38bdf8', '#e879f9'];
const MIN_SIZE = 1;
const MAX_SIZE = 20;
const LS_KEY = 'testara_pad_strokes';

const WritingPad = forwardRef(({
    questionIndex = 0,
    isShared = false,
    socket = null,
    roomCode = null,
    playerColor = '#a5b4fc',
    playerName = '',
    onClose,
}, ref) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#ffffff');
    const [strokeWidth, setStrokeWidth] = useState(3);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Dragging state
    const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Resize state
    const [size, setSize] = useState({ w: 380, h: 320 });
    const [isResizing, setIsResizing] = useState(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    // Per-question stroke history
    const strokesRef = useRef(new Map());
    const currentPathRef = useRef([]);

    // Load from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(LS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                const map = new Map();
                Object.entries(parsed).forEach(([k, v]) => map.set(Number(k), v));
                strokesRef.current = map;
            }
        } catch { /* ignore */ }
    }, []);

    const saveToLS = useCallback(() => {
        try {
            const obj = {};
            strokesRef.current.forEach((val, key) => { obj[key] = val; });
            localStorage.setItem(LS_KEY, JSON.stringify(obj));
        } catch { /* ignore */ }
    }, []);

    const getStrokeData = useCallback(() => {
        if (!strokesRef.current.has(questionIndex)) {
            strokesRef.current.set(questionIndex, { strokes: [], undone: [] });
        }
        return strokesRef.current.get(questionIndex);
    }, [questionIndex]);

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const data = getStrokeData();
        data.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;
            ctx.beginPath();
            ctx.strokeStyle = stroke.tool === 'eraser' ? '#0f172a' : stroke.color;
            ctx.lineWidth = stroke.tool === 'eraser' ? stroke.size * 3 : stroke.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
    }, [getStrokeData]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [resizeCanvas, isFullscreen, questionIndex, size]);

    const getPos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const startDrawing = useCallback((e) => {
        e.preventDefault();
        const pos = getPos(e);
        setIsDrawing(true);
        currentPathRef.current = [pos];
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
        ctx.lineWidth = tool === 'eraser' ? strokeWidth * 3 : strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    }, [getPos, tool, color, strokeWidth]);

    const draw = useCallback((e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        currentPathRef.current.push(pos);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }, [isDrawing, getPos]);

    const stopDrawing = useCallback((e) => {
        if (!isDrawing) return;
        e?.preventDefault();
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getContext('2d').globalCompositeOperation = 'source-over';
        if (currentPathRef.current.length > 1) {
            const stroke = {
                points: [...currentPathRef.current],
                color: tool === 'eraser' ? '#0f172a' : color,
                size: strokeWidth, tool,
                playerId: playerName || 'local',
            };
            const data = getStrokeData();
            data.strokes.push(stroke);
            data.undone = [];
            saveToLS();
            if (isShared && socket && roomCode) {
                socket.emit('padDraw', { code: roomCode, questionIndex, stroke });
            }
        }
        currentPathRef.current = [];
    }, [isDrawing, tool, color, strokeWidth, getStrokeData, saveToLS, isShared, socket, roomCode, questionIndex, playerName]);

    const handleUndo = useCallback(() => {
        const data = getStrokeData();
        if (data.strokes.length === 0) return;
        data.undone.push(data.strokes.pop());
        saveToLS(); redrawCanvas();
        if (isShared && socket && roomCode) socket.emit('padUndo', { code: roomCode, questionIndex, playerId: playerName });
    }, [getStrokeData, saveToLS, redrawCanvas, isShared, socket, roomCode, questionIndex, playerName]);

    const handleRedo = useCallback(() => {
        const data = getStrokeData();
        if (data.undone.length === 0) return;
        data.strokes.push(data.undone.pop());
        saveToLS(); redrawCanvas();
    }, [getStrokeData, saveToLS, redrawCanvas]);

    const handleClear = useCallback(() => {
        const data = getStrokeData();
        data.strokes = []; data.undone = [];
        saveToLS(); redrawCanvas();
        if (isShared && socket && roomCode) socket.emit('padClear', { code: roomCode, questionIndex, playerId: playerName });
    }, [getStrokeData, saveToLS, redrawCanvas, isShared, socket, roomCode, questionIndex, playerName]);

    // Remote stroke listeners
    useEffect(() => {
        if (!isShared || !socket) return;
        const onRemoteDraw = ({ questionIndex: qi, stroke }) => {
            if (qi !== questionIndex) return;
            getStrokeData().strokes.push(stroke); redrawCanvas();
        };
        const onRemoteClear = ({ questionIndex: qi }) => {
            if (qi !== questionIndex) return;
            const d = getStrokeData(); d.strokes = []; d.undone = []; redrawCanvas();
        };
        const onRemoteUndo = ({ questionIndex: qi, playerId }) => {
            if (qi !== questionIndex) return;
            const d = getStrokeData();
            for (let i = d.strokes.length - 1; i >= 0; i--) {
                if (d.strokes[i].playerId === playerId) { d.strokes.splice(i, 1); break; }
            }
            redrawCanvas();
        };
        socket.on('padDraw', onRemoteDraw);
        socket.on('padClear', onRemoteClear);
        socket.on('padUndo', onRemoteUndo);
        return () => { socket.off('padDraw', onRemoteDraw); socket.off('padClear', onRemoteClear); socket.off('padUndo', onRemoteUndo); };
    }, [isShared, socket, questionIndex, getStrokeData, redrawCanvas]);

    // ── Drag handlers ──
    const onDragStart = useCallback((e) => {
        if (isFullscreen) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragOffset.current = { x: clientX - position.x, y: clientY - position.y };
        setIsDragging(true);
    }, [position, isFullscreen]);

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            setPosition({
                x: Math.max(0, Math.min(window.innerWidth - 100, clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 50, clientY - dragOffset.current.y)),
            });
        };
        const onUp = () => setIsDragging(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [isDragging]);

    // ── Resize handlers ──
    const onResizeStart = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        resizeStart.current = { x: clientX, y: clientY, w: size.w, h: size.h };
        setIsResizing(true);
    }, [size]);

    useEffect(() => {
        if (!isResizing) return;
        const onMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            setSize({
                w: Math.max(260, resizeStart.current.w + (clientX - resizeStart.current.x)),
                h: Math.max(200, resizeStart.current.h + (clientY - resizeStart.current.y)),
            });
        };
        const onUp = () => setIsResizing(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [isResizing]);

    const floatStyle = isFullscreen ? {} : {
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
        zIndex: 9990,
    };

    return (
        <div className={`writing-pad floating ${isFullscreen ? 'fullscreen' : ''}`} style={floatStyle}>
            {/* Drag handle */}
            <div
                className="wp-drag-handle"
                onMouseDown={onDragStart}
                onTouchStart={onDragStart}
            >
                <GripHorizontal size={14} />
                <span className="wp-drag-title">Scratch Pad — Q{questionIndex + 1}</span>
                {isShared && <span className="wp-shared-badge"><Eye size={10} /> Shared</span>}
            </div>

            {/* Toolbar */}
            <div className="wp-toolbar">
                <div className="wp-tools-left">
                    <button className={`wp-tool-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen"><Pencil size={14} /></button>
                    <button className={`wp-tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={14} /></button>
                    <div className="wp-separator" />
                    <button className="wp-tool-btn" onClick={handleUndo} title="Undo"><Undo2 size={14} /></button>
                    <button className="wp-tool-btn" onClick={handleRedo} title="Redo"><Redo2 size={14} /></button>
                    <button className="wp-tool-btn danger" onClick={handleClear} title="Clear"><Trash2 size={14} /></button>
                    <div className="wp-separator" />

                    {/* Color picker */}
                    <div className="wp-color-group">
                        <button className="wp-tool-btn wp-color-btn" onClick={() => setShowColorPicker(!showColorPicker)} title="Color">
                            <div className="wp-color-swatch" style={{ backgroundColor: color }} />
                        </button>
                        {showColorPicker && (
                            <div className="wp-color-picker animate-fade-in">
                                {COLORS.map(c => (
                                    <button key={c} className={`wp-color-opt ${color === c ? 'active' : ''}`}
                                        style={{ backgroundColor: c }}
                                        onClick={() => { setColor(c); setShowColorPicker(false); }} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="wp-size-group">
                        <button className="wp-tool-btn" onClick={() => setStrokeWidth(Math.max(MIN_SIZE, strokeWidth - 1))}><Minus size={12} /></button>
                        <span className="wp-size-label">{strokeWidth}</span>
                        <button className="wp-tool-btn" onClick={() => setStrokeWidth(Math.min(MAX_SIZE, strokeWidth + 1))}><Plus size={12} /></button>
                    </div>
                </div>

                <div className="wp-tools-right">
                    <button className="wp-tool-btn" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Restore' : 'Fullscreen'}>
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    {onClose && <button className="wp-tool-btn danger" onClick={onClose} title="Close"><X size={14} /></button>}
                </div>
            </div>

            {/* Canvas */}
            <div className="wp-canvas-container" ref={containerRef}>
                <canvas ref={canvasRef} className="wp-canvas"
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
            </div>

            {/* Resize handle */}
            {!isFullscreen && (
                <div className="wp-resize-handle" onMouseDown={onResizeStart} onTouchStart={onResizeStart} />
            )}
        </div>
    );
});

WritingPad.displayName = 'WritingPad';
export default WritingPad;
