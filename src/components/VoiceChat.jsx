import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Volume2, VolumeX } from 'lucide-react';
import './VoiceChat.css';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

const VoiceChat = ({ socket, roomCode, playerName, participants = [] }) => {
    const [inVoice, setInVoice] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [voicePeers, setVoicePeers] = useState([]); // names of people in voice
    const [speakingPeers, setSpeakingPeers] = useState(new Set());
    const [error, setError] = useState('');
    const [httpsRequired, setHttpsRequired] = useState(false);
    const [tunnelUrl, setTunnelUrl] = useState('');

    const localStreamRef = useRef(null);
    const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
    const audioElementsRef = useRef(new Map()); // socketId -> HTMLAudioElement
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);

    // Cleanup all peer connections
    const cleanupConnections = useCallback(() => {
        peerConnectionsRef.current.forEach((pc) => {
            pc.close();
        });
        peerConnectionsRef.current.clear();

        audioElementsRef.current.forEach((audio) => {
            audio.srcObject = null;
            audio.remove();
        });
        audioElementsRef.current.clear();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
    }, []);

    // Create a peer connection for a specific remote peer
    const createPeerConnection = useCallback((remotePeerId, remotePeerName, isInitiator) => {
        if (peerConnectionsRef.current.has(remotePeerId)) return peerConnectionsRef.current.get(remotePeerId);

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        // Add local stream tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        // ICE candidate → send to remote
        pc.onicecandidate = (e) => {
            if (e.candidate && socket) {
                socket.emit('voiceIceCandidate', {
                    code: roomCode,
                    targetId: remotePeerId,
                    candidate: e.candidate,
                });
            }
        };

        // Receive remote audio stream
        pc.ontrack = (e) => {
            let audio = audioElementsRef.current.get(remotePeerId);
            if (!audio) {
                audio = document.createElement('audio');
                audio.autoplay = true;
                audio.style.display = 'none';
                document.body.appendChild(audio); // Append to DOM for mobile autoplay
                audioElementsRef.current.set(remotePeerId, audio);
            }
            audio.srcObject = e.streams[0];
            audio.play().catch(err => console.warn('Autoplay prevented:', err));

            // Voice activity detection for this peer
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioCtx.createMediaStreamSource(e.streams[0]);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);

                const checkSpeaking = () => {
                    analyser.getByteFrequencyData(data);
                    const avg = data.reduce((a, b) => a + b, 0) / data.length;
                    setSpeakingPeers(prev => {
                        const next = new Set(prev);
                        if (avg > 15) next.add(remotePeerName);
                        else next.delete(remotePeerName);
                        return next;
                    });
                    if (peerConnectionsRef.current.has(remotePeerId)) {
                        requestAnimationFrame(checkSpeaking);
                    }
                };
                checkSpeaking();
            } catch { /* VAD not critical */ }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                pc.close();
                peerConnectionsRef.current.delete(remotePeerId);
                audioElementsRef.current.get(remotePeerId)?.remove();
                audioElementsRef.current.delete(remotePeerId);
            }
        };

        peerConnectionsRef.current.set(remotePeerId, pc);

        // If initiator, create offer
        if (isInitiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    socket.emit('voiceOffer', {
                        code: roomCode,
                        targetId: remotePeerId,
                        offer: pc.localDescription,
                    });
                })
                .catch(console.error);
        }

        return pc;
    }, [socket, roomCode]);

    // Local speaking detection
    const startLocalVAD = useCallback((stream) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            analyserRef.current = analyser;
            const data = new Uint8Array(analyser.frequencyBinCount);

            const check = () => {
                analyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                setSpeakingPeers(prev => {
                    const next = new Set(prev);
                    if (avg > 15 && !isMuted) next.add(playerName);
                    else next.delete(playerName);
                    return next;
                });
                animFrameRef.current = requestAnimationFrame(check);
            };
            check();
        } catch { /* ok */ }
    }, [playerName, isMuted]);

    // Join voice channel
    const joinVoice = useCallback(async () => {
        try {
            setError('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setInVoice(true);

            startLocalVAD(stream);

            // Notify room
            socket.emit('voiceJoin', { code: roomCode, peerName: playerName });
        } catch (err) {
            setError('Mic access denied. Check browser permissions.');
            console.error('getUserMedia error:', err);
        }
    }, [socket, roomCode, playerName, startLocalVAD]);

    // Leave voice channel
    const leaveVoice = useCallback(() => {
        socket?.emit('voiceLeave', { code: roomCode, peerName: playerName });
        cleanupConnections();
        setInVoice(false);
        setIsMuted(false);
        setIsDeafened(false);
        setSpeakingPeers(new Set());
        setVoicePeers([]);
    }, [socket, roomCode, playerName, cleanupConnections]);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => {
                t.enabled = isMuted; // flip
            });
        }
        setIsMuted(!isMuted);
    }, [isMuted]);

    // Toggle deafen
    const toggleDeafen = useCallback(() => {
        audioElementsRef.current.forEach(audio => {
            audio.muted = !isDeafened; // flip
        });
        setIsDeafened(!isDeafened);
    }, [isDeafened]);

    // Socket event handlers
    useEffect(() => {
        if (!socket || !inVoice) return;

        // Someone else joined voice → create peer connection (I'm initiator)
        const onVoiceJoin = ({ peerId, peerName }) => {
            if (peerId === socket.id) return;
            setVoicePeers(prev => [...new Set([...prev, peerName])]);
            createPeerConnection(peerId, peerName, true);
        };

        // Receive an offer → create connection, set remote desc, send answer
        const onVoiceOffer = async ({ fromId, fromName, offer }) => {
            const pc = createPeerConnection(fromId, fromName, false);
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('voiceAnswer', {
                    code: roomCode,
                    targetId: fromId,
                    answer: pc.localDescription,
                });
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        };

        // Receive an answer
        const onVoiceAnswer = async ({ fromId, answer }) => {
            const pc = peerConnectionsRef.current.get(fromId);
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (err) {
                    console.error('Error setting answer:', err);
                }
            }
        };

        // Receive ICE candidate
        const onVoiceIce = async ({ fromId, candidate }) => {
            const pc = peerConnectionsRef.current.get(fromId);
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error('Error adding ICE candidate:', err);
                }
            }
        };

        // Someone left voice
        const onVoiceLeave = ({ peerId, peerName }) => {
            setVoicePeers(prev => prev.filter(n => n !== peerName));
            setSpeakingPeers(prev => {
                const next = new Set(prev);
                next.delete(peerName);
                return next;
            });
            const pc = peerConnectionsRef.current.get(peerId);
            if (pc) {
                pc.close();
                peerConnectionsRef.current.delete(peerId);
            }
            audioElementsRef.current.get(peerId)?.remove();
            audioElementsRef.current.delete(peerId);
        };

        // List of current voice peers (on initial join)
        const onVoicePeers = ({ peers }) => {
            setVoicePeers(peers.map(p => p.name));
            // Create connections to existing peers (I'm initiator for all)
            peers.forEach(p => {
                if (p.id !== socket.id) {
                    createPeerConnection(p.id, p.name, true);
                }
            });
        };

        socket.on('voiceJoin', onVoiceJoin);
        socket.on('voiceOffer', onVoiceOffer);
        socket.on('voiceAnswer', onVoiceAnswer);
        socket.on('voiceIceCandidate', onVoiceIce);
        socket.on('voiceLeave', onVoiceLeave);
        socket.on('voicePeers', onVoicePeers);

        return () => {
            socket.off('voiceJoin', onVoiceJoin);
            socket.off('voiceOffer', onVoiceOffer);
            socket.off('voiceAnswer', onVoiceAnswer);
            socket.off('voiceIceCandidate', onVoiceIce);
            socket.off('voiceLeave', onVoiceLeave);
            socket.off('voicePeers', onVoicePeers);
        };
    }, [socket, inVoice, roomCode, createPeerConnection]);

    // Check for HTTPS / Tunnel requirement
    useEffect(() => {
        const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isSecure) {
            setHttpsRequired(true);
            fetch('/api/tunnel/status')
                .then(r => r.json())
                .then(data => { if (data.active && data.url) setTunnelUrl(data.url); })
                .catch(() => {});
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupConnections();
        };
    }, [cleanupConnections]);

    if (httpsRequired) {
        return (
            <div className="vc-join-bar">
                <span className="vc-error" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MicOff size={14} /> HTTPS Required for Mic
                </span>
                {tunnelUrl ? (
                    <a href={`${tunnelUrl}${window.location.pathname}`} className="vc-join-btn" style={{ textDecoration: 'none' }}>
                        Switch to Tunnel
                    </a>
                ) : (
                    <span className="vc-error" style={{ fontSize: '0.65rem' }}>(Tunnel inactive)</span>
                )}
            </div>
        );
    }

    if (!inVoice) {
        return (
            <div className="vc-join-bar">
                <button className="vc-join-btn" onClick={joinVoice}>
                    <Phone size={16} /> Join Voice
                </button>
                {error && <span className="vc-error">{error}</span>}
            </div>
        );
    }

    const allInVoice = [playerName, ...voicePeers];

    return (
        <div className="vc-bar">
            <div className="vc-participants">
                {allInVoice.map(name => (
                    <div
                        key={name}
                        className={`vc-avatar ${speakingPeers.has(name) ? 'speaking' : ''} ${name === playerName && isMuted ? 'muted' : ''}`}
                        title={name}
                    >
                        <span className="vc-avatar-letter">{name.charAt(0).toUpperCase()}</span>
                        {name === playerName && isMuted && <MicOff size={10} className="vc-muted-icon" />}
                    </div>
                ))}
            </div>

            <div className="vc-controls">
                <button
                    className={`vc-ctrl-btn ${isMuted ? 'active-danger' : ''}`}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button
                    className={`vc-ctrl-btn ${isDeafened ? 'active-danger' : ''}`}
                    onClick={toggleDeafen}
                    title={isDeafened ? 'Undeafen' : 'Deafen'}
                >
                    {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <button
                    className="vc-ctrl-btn vc-leave-btn"
                    onClick={leaveVoice}
                    title="Leave Voice"
                >
                    <PhoneOff size={16} />
                </button>
            </div>
        </div>
    );
};

export default VoiceChat;
