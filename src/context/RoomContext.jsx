import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

// Detect if we're on a local network or accessed remotely (e.g. Cloudflare tunnel)
const hostname = window.location.hostname;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
const LOCAL_SOCKET_URL = isLocal ? `http://${hostname}:3001` : window.location.origin;

export const RoomProvider = ({ children }) => {
    const [connected, setConnected] = useState(false);
    const [serverUrl, setServerUrl] = useState(LOCAL_SOCKET_URL);
    const [tunnelUrl, setTunnelUrl] = useState(null);
    const [tunnelActive, setTunnelActive] = useState(false);
    const [tunnelLoading, setTunnelLoading] = useState(false);
    const [shortUrl, setShortUrl] = useState(null);
    const [roomState, setRoomState] = useState({
        roomCode: null,
        isHost: false,
        hostName: '',
        playerName: '',
        email: null,
        roomMode: 'friendly',
        enableChat: true,
        isConductor: false,
        testCode: null,
        participants: [],
        started: false,
        examStarted: false,
        examType: null,
        testFormat: null,
        results: [],
        allSubmitted: false,
        totalParticipants: 0,
        error: null,
    });
    const socketRef = useRef(null);

    const roomStateRef = useRef(roomState);
    useEffect(() => {
        roomStateRef.current = roomState;
    }, [roomState]);

    // Create or reconnect socket to a given URL
    const initSocket = useCallback((url) => {
        // Disconnect existing socket if any
        if (socketRef.current) {
            socketRef.current.disconnect();
        }

        const s = io(url, {
            autoConnect: false,
            transports: ['websocket', 'polling'],
        });

        s.on('connect', () => {
            setConnected(true);
            const state = roomStateRef.current;
            if (state && state.roomCode && state.playerName) {
                console.log(`[Socket] Reconnecting & auto-rejoining room: ${state.roomCode}`);
                s.emit('joinRoom', {
                    code: state.roomCode,
                    playerName: state.playerName,
                    email: state.email || null
                }, (response) => {
                    if (response.success) {
                        console.log(`[Socket] Auto-rejoined room successfully.`);
                        setRoomState(prev => ({
                            ...prev,
                            participants: response.room.participants
                        }));
                    } else {
                        console.error(`[Socket] Auto-rejoin failed:`, response.error);
                    }
                });
            }
        });
        s.on('disconnect', () => setConnected(false));

        s.on('participantJoined', ({ participants }) => {
            setRoomState(prev => ({ ...prev, participants }));
        });

        s.on('participantLeft', ({ participants }) => {
            setRoomState(prev => ({ ...prev, participants }));
        });

        s.on('examProgressUpdate', ({ participants }) => {
            setRoomState(prev => ({ ...prev, participants }));
        });

        s.on('roomClosed', ({ reason }) => {
            setRoomState(prev => ({
                ...prev,
                roomCode: null,
                isHost: false,
                enableChat: true,
                participants: [],
                started: false,
                error: reason,
            }));
        });

        s.on('leaderboardUpdate', ({ results, participants, totalParticipants, allSubmitted }) => {
            setRoomState(prev => ({ ...prev, results, participants: participants || prev.participants, totalParticipants, allSubmitted }));
        });

        socketRef.current = s;
        return s;
    }, []);

    // Init socket on mount
    useEffect(() => {
        initSocket(LOCAL_SOCKET_URL);
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [initSocket]);

    // Check tunnel status on mount (handles page refresh/HMR while tunnel is running)
    useEffect(() => {
        fetch('/api/tunnel/status')
            .then(r => r.json())
            .then(data => {
                if (data.active && data.url) {
                    setTunnelUrl(data.url);
                    setShortUrl(data.shortUrl || data.url);
                    setTunnelActive(true);
                }
            })
            .catch(() => { });
    }, []);

    const connectSocket = useCallback(() => {
        if (socketRef.current && !socketRef.current.connected) {
            socketRef.current.connect();
        }
    }, []);

    // Tunnel management
    const startTunnel = useCallback(async () => {
        setTunnelLoading(true);
        try {
            const res = await fetch('/api/tunnel/start', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setTunnelUrl(data.url);
                setShortUrl(data.shortUrl || data.url);
                setTunnelActive(true);
                return data.url;
            } else {
                throw new Error(data.error || 'Failed to start tunnel');
            }
        } catch (err) {
            console.error('Tunnel error:', err);
            throw err;
        } finally {
            setTunnelLoading(false);
        }
    }, []);

    const stopTunnel = useCallback(async () => {
        try {
            await fetch('/api/tunnel/stop', { method: 'POST' });
        } catch (e) { /* ignore */ }
        setTunnelUrl(null);
        setShortUrl(null);
        setTunnelActive(false);
    }, []);

    // Connect to a remote server URL (for joining via internet link)
    const setRemoteServerUrl = useCallback((url) => {
        if (url === serverUrl) return;
        setServerUrl(url);
        initSocket(url);
    }, [serverUrl, initSocket]);

    // Reset to local server
    const resetToLocal = useCallback(() => {
        setServerUrl(LOCAL_SOCKET_URL);
        initSocket(LOCAL_SOCKET_URL);
    }, [initSocket]);

    // Helper: ensure socket is connected before emitting
    const ensureConnected = useCallback(() => {
        return new Promise((resolve, reject) => {
            const s = socketRef.current;
            if (!s) return reject(new Error('Socket not initialized'));

            if (s.connected) return resolve(s);

            s.connect();

            const timeout = setTimeout(() => {
                s.off('connect', onConnect);
                reject(new Error('Connection timed out. Is the server running?'));
            }, 5000);

            const onConnect = () => {
                clearTimeout(timeout);
                resolve(s);
            };
            s.once('connect', onConnect);
        });
    }, []);

    const createRoom = useCallback(async ({ hostName, examType, testFormat, questions, roomMode, enableChat, email }) => {
        const s = await ensureConnected();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Room creation timed out.')), 8000);
            s.emit('createRoom', { hostName, examType, testFormat, questions, roomMode, enableChat, email }, (response) => {
                clearTimeout(timeout);
                if (response.success) {
                    setRoomState(prev => ({
                        ...prev,
                        roomCode: response.code,
                        isHost: true,
                        hostName,
                        playerName: hostName,
                        email: email || null,
                        roomMode,
                        enableChat: response.room.enableChat !== false,
                        isConductor: response.room.isConductor || false,
                        testCode: response.room.testCode || null,
                        examType,
                        testFormat,
                        participants: response.room.participants,
                        started: false,
                        examStarted: false,
                        error: null,
                    }));
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }, [ensureConnected]);

    const joinRoom = useCallback(async ({ code, playerName, email }) => {
        const s = await ensureConnected();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Join timed out.')), 8000);
            s.emit('joinRoom', { code: code.toUpperCase(), playerName, email }, (response) => {
                clearTimeout(timeout);
                if (response.success) {
                    setRoomState(prev => ({
                        ...prev,
                        roomCode: code.toUpperCase(),
                        isHost: response.room.participants.find(p => p.name === playerName)?.isHost || false,
                        playerName,
                        email: email || null,
                        roomMode: response.room.roomMode,
                        enableChat: response.room.enableChat !== false,
                        isConductor: response.room.isConductor || response.room.participants.find(p => p.name === playerName)?.isConductor || false,
                        testCode: response.room.testCode || null,
                        examType: response.room.examType,
                        testFormat: response.room.testFormat,
                        participants: response.room.participants,
                        started: response.room.started || false,
                        examStarted: response.room.examStarted || false,
                        error: null,
                      }));
                      resolve(response);
                  } else {
                      reject(new Error(response.error));
                  }
              });
          });
      }, [ensureConnected]);


    const startRoom = useCallback(() => {
        return new Promise((resolve, reject) => {
            socketRef.current?.emit('startRoom', { code: roomState.roomCode }, (response) => {
                if (response.success) {
                    setRoomState(prev => ({ ...prev, started: true }));
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }, [roomState.roomCode]);

    const syncNavigate = useCallback((questionIndex) => {
        if (roomState.isHost && roomState.roomMode === 'sync') {
            socketRef.current?.emit('syncNavigate', { code: roomState.roomCode, questionIndex });
        }
    }, [roomState.roomCode, roomState.isHost, roomState.roomMode]);

    const submitResults = useCallback((resultData) => {
        return new Promise((resolve, reject) => {
            socketRef.current?.emit('submitResults', {
                code: roomState.roomCode,
                playerName: roomState.playerName,
                ...resultData,
            }, (response) => {
                if (response?.success) resolve(response);
                else reject(new Error(response?.error || 'Submit failed'));
            });
        });
    }, [roomState.roomCode, roomState.playerName]);

    const getLeaderboard = useCallback(() => {
        return new Promise((resolve, reject) => {
            socketRef.current?.emit('getLeaderboard', { code: roomState.roomCode }, (response) => {
                if (response.success) {
                    setRoomState(prev => ({
                        ...prev,
                        results: response.results,
                        participants: response.participants || prev.participants,
                        totalParticipants: response.totalParticipants,
                        allSubmitted: response.allSubmitted,
                    }));
                    resolve(response);
                } else {
                    reject(new Error(response.error));
                }
            });
        });
    }, [roomState.roomCode]);

    const leaveRoom = useCallback(() => {
        socketRef.current?.disconnect();
        // Reconnect to current server URL
        initSocket(serverUrl);
        setRoomState({
            roomCode: null,
            isHost: false,
            hostName: '',
            playerName: '',
            email: null,
            roomMode: 'friendly',
            enableChat: true,
            participants: [],
            started: false,
            examStarted: false,
            examType: null,
            testFormat: null,
            results: [],
            allSubmitted: false,
            totalParticipants: 0,
            error: null,
        });
    }, [initSocket, serverUrl]);

    return (
        <RoomContext.Provider value={{
            socket: socketRef.current,
            connected,
            serverUrl,
            tunnelUrl,
            shortUrl,
            tunnelActive,
            tunnelLoading,
            ...roomState,
            createRoom,
            joinRoom,
            startRoom,
            leaveRoom,
            syncNavigate,
            submitResults,
            getLeaderboard,
            startTunnel,
            stopTunnel,
            setRemoteServerUrl,
            resetToLocal,
        }}>
            {children}
        </RoomContext.Provider>
    );
};

