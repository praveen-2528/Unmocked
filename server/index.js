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
            console.log(`[Cleanup] Room ${code} deleted (inactive)`);
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

// ─── Serve Frontend (Production) ─────────────────────────────────────
const frontendPath = join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(join(frontendPath, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🚀 UnMocked server running on http://localhost:${PORT}\n`);
});

