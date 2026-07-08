import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'index.js');
const source = fs.readFileSync(indexPath, 'utf-8');

const restIndex = source.indexOf('// ─── REST Endpoints');
const socketIndex = source.indexOf('// ─── Socket.IO');
const serveIndex = source.indexOf('// ─── Serve Frontend');

if (restIndex === -1 || socketIndex === -1 || serveIndex === -1) {
    console.error("Could not find section markers. Details:");
    console.log("REST:", restIndex !== -1, "Socket:", socketIndex !== -1, "Serve:", serveIndex !== -1);
    process.exit(1);
}

const topPart = source.substring(0, restIndex);
const restPart = source.substring(restIndex, socketIndex);
const socketPart = source.substring(socketIndex, serveIndex);
const servePart = source.substring(serveIndex);

// Generate store.js
const storeContent = `
export const rooms = new Map();
export const ROOM_TTL = 10 * 60 * 1000;

export const generateRoomCode = () => {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
};

export const isSeatingArrangement = (q, testFormat) => {
    if (!q) return false;
    const isTopicFormat = testFormat === 'topic';
    const topic = (q.topic || '').toLowerCase();
    const type = (q.questionType || q.question_type || '').toLowerCase();
    return isTopicFormat && (topic.includes('seating arrangement') || type === 'seating_arrangement');
};

export const getSeatingArrangementType = (q) => {
    if (!q) return 'linear';
    const text = (q.text || q.question_text || '').toLowerCase();
    const subtopic = (q.subtopic || '').toLowerCase();
    
    if (text.includes('circular') || text.includes('circle') || text.includes('round table') || subtopic.includes('circular')) {
        return 'circular';
    }
    if (text.includes('parallel') || text.includes('two rows') || text.includes('facing each other') || subtopic.includes('parallel')) {
        return 'parallel';
    }
    return 'linear';
};

export const getMembersCount = (correctOptionText) => {
    if (!correctOptionText || typeof correctOptionText !== 'string') return 0;
    const members = correctOptionText.split(/[^A-Za-z0-9]+/).filter(Boolean);
    return members.length;
};

export const normalizeSequence = (str) => {
    if (typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
};
`;
fs.writeFileSync(path.join(__dirname, 'store.js'), storeContent.trim());

// Generate routes.js
const routesContent = `
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { rooms } from './store.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'unmocked_secret_key_change_in_production';

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userName = decoded.name;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const verifyAdmin = (req, res, next) => {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
};

export const setupRoutes = (app) => {
${restPart.replace(/app\./g, '    app.').replace('// ─── REST Endpoints ──────────────────────────────────────────────────', '')}
};
`;
fs.writeFileSync(path.join(__dirname, 'routes.js'), routesContent.trim());

// Generate socket.js
const socketContent = `
import { rooms, isSeatingArrangement, getSeatingArrangementType, getMembersCount, normalizeSequence, generateRoomCode } from './store.js';
import db from './db.js';
import XLSX from 'xlsx';
import { JWT_SECRET } from './routes.js';
import jwt from 'jsonwebtoken';

export const setupSockets = (io) => {
${socketPart.replace(/io\.on/g, '    io.on').replace('// ─── Socket.IO ───────────────────────────────────────────────────────', '')}
};
`;
fs.writeFileSync(path.join(__dirname, 'socket.js'), socketContent.trim());

// Rewrite index.js
const newIndexContent = `
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rooms, ROOM_TTL } from './store.js';
import { setupRoutes } from './routes.js';
import { setupSockets } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Auto-cleanup stale rooms
setInterval(() => {
    const now = Date.now();
    let deleted = false;
    for (const [code, room] of rooms) {
        if (now - room.lastActivity > ROOM_TTL) {
            io.to(code).emit('roomClosed', { reason: 'Room expired due to inactivity.' });
            rooms.delete(code);
            deleted = true;
            console.log(\`[Cleanup] Room \${code} deleted (inactive)\`);
        }
    }
    if (deleted) {
        io.emit('roomsUpdate', { rooms: Array.from(rooms.values()).map(r => ({
            code: r.code,
            hostName: r.hostName,
            examType: r.examType,
            testFormat: r.testFormat,
            roomMode: r.roomMode,
            participants: r.participants.length
        }))});
    }
}, 60 * 1000);

// Set up modularized routes and sockets
setupRoutes(app);
setupSockets(io);

${servePart}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running on port \${PORT}\`);
});
`;
fs.writeFileSync(path.join(__dirname, 'index.js'), newIndexContent.trim());

console.log("Refactoring complete.");
