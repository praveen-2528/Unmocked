import React from 'react';

// Insert badge animations globally if they don't already exist
if (typeof document !== 'undefined') {
    const styleId = 'unmocked-badge-animations';
    if (!document.getElementById(styleId)) {
        const styleSheet = document.createElement('style');
        styleSheet.id = styleId;
        styleSheet.innerText = `
            @keyframes badge-pulse {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.4)); }
                50% { transform: scale(1.05); filter: drop-shadow(0 8px 20px var(--glow-color, rgba(255,255,255,0.4))); }
            }
            @keyframes flame-flicker {
                0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.95; }
                50% { transform: scale(1.08) rotate(2deg); opacity: 1; }
            }
            @keyframes hand-rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes shine-glow {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 1; }
            }
            @keyframes float-badge {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
            }
            @keyframes orbit-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes draw-path {
                0%, 100% { stroke-dashoffset: 0; }
                50% { stroke-dashoffset: 15; }
            }
            @keyframes sword-clang {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.03) rotate(1deg); }
            }
        `;
        document.head.appendChild(styleSheet);
    }
}

// 1. SPEED DEMON (speed_demon)
export const SpeedDemonBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(239, 68, 68, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="flameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="50%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#eab308" />
                </linearGradient>
                <linearGradient id="watchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1e3a8a" />
                </linearGradient>
                <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Background Flame Aura */}
            <g style={animated ? { animation: 'flame-flicker 1.5s infinite alternate ease-in-out', transformOrigin: '50px 75px' } : {}}>
                <path d="M50 15C50 15 30 40 30 65C30 76.05 38.95 85 50 85C61.05 85 70 76.05 70 65C70 40 50 15 50 15Z" fill="url(#flameGrad)" opacity="0.3" filter="url(#neonGlow)" />
                <path d="M50 25C50 25 35 46 35 65C35 73.28 41.72 80 50 80C58.28 80 65 73.28 65 65C65 46 50 25 50 25Z" fill="url(#flameGrad)" opacity="0.8" />
            </g>

            {/* Stopwatch Body */}
            <circle cx="50" cy="58" r="22" fill="url(#watchGrad)" stroke="#f1f5f9" strokeWidth="2" />
            <rect x="47" y="31" width="6" height="5" fill="#f1f5f9" rx="1" />
            <circle cx="50" cy="30" r="3" fill="#ef4444" />
            <rect x="63" y="34" width="4" height="6" fill="#f1f5f9" rx="1" transform="rotate(45 63 34)" />

            {/* Dial Inside */}
            <circle cx="50" cy="58" r="17" fill="#0f172a" />
            <circle cx="50" cy="58" r="1" fill="#f1f5f9" />
            
            {/* Ticks */}
            <line x1="50" y1="43" x2="50" y2="45" stroke="#94a3b8" strokeWidth="1" />
            <line x1="50" y1="71" x2="50" y2="73" stroke="#94a3b8" strokeWidth="1" />
            <line x1="35" y1="58" x2="37" y2="58" stroke="#94a3b8" strokeWidth="1" />
            <line x1="63" y1="58" x2="65" y2="58" stroke="#94a3b8" strokeWidth="1" />

            {/* Needle */}
            <line 
                x1="50" y1="58" x2="50" y2="46" 
                stroke="#ef4444" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                style={animated ? { animation: 'hand-rotate 1s infinite linear', transformOrigin: '50px 58px' } : {}}
            />
        </svg>
    );
};

// 2. DEDICATED LEARNER (dedicated_learner)
export const DedicatedLearnerBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(99, 102, 241, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="book1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#312e81" />
                </linearGradient>
                <linearGradient id="book2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#0891b2" />
                </linearGradient>
                <linearGradient id="book3" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#be185d" />
                </linearGradient>
                <filter id="indigoGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Glowing Aura Ring */}
            <circle cx="50" cy="50" r="38" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" style={animated ? { animation: 'orbit-spin 12s infinite linear', transformOrigin: '50px 50px' } : {}} />
            <circle cx="50" cy="50" r="42" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 8" opacity="0.3" style={animated ? { animation: 'orbit-spin 8s infinite linear reverse', transformOrigin: '50px 50px' } : {}} />

            {/* Stack of Books */}
            <g style={animated ? { animation: 'float-badge 2s infinite ease-in-out' } : {}}>
                {/* Bottom Book */}
                <path d="M25 65 L65 75 L75 65 L35 55 Z" fill="url(#book1)" stroke="#1e1b4b" strokeWidth="1.5" />
                <path d="M25 65 L25 69 C25 71, 28 72, 33 72 L67 78 C71 78, 75 75, 75 73 L75 65" fill="#f1f5f9" stroke="#1e1b4b" strokeWidth="1" />
                
                {/* Middle Book */}
                <path d="M28 50 L68 58 L78 48 L38 40 Z" fill="url(#book2)" stroke="#0e7490" strokeWidth="1.5" />
                <path d="M28 50 L28 54 C28 56, 31 57, 36 57 L70 61 C74 61, 78 58, 78 56 L78 48" fill="#f1f5f9" stroke="#0e7490" strokeWidth="1" />

                {/* Top Book Open */}
                <path d="M30 35 L48 41 L66 35 L50 29 Z" fill="url(#book3)" stroke="#9d174d" strokeWidth="1.5" />
                <path d="M30 35 L30 39 C30 41, 33 42, 38 42 L48 44 L48 41" fill="#f1f5f9" stroke="#9d174d" strokeWidth="1" />
                <path d="M66 35 L66 39 C66 41, 63 42, 58 42 L48 44 L48 41" fill="#f1f5f9" stroke="#9d174d" strokeWidth="1" />
            </g>

            {/* Sparkles */}
            <path d="M22 25 L24 29 L28 31 L24 33 L22 37 L20 33 L16 31 L20 29 Z" fill="#eab308" opacity="0.8" style={animated ? { animation: 'shine-glow 1.5s infinite alternate ease-in-out' } : {}} />
            <path d="M76 22 L78 25 L81 27 L78 29 L76 32 L74 29 L71 27 L74 25 Z" fill="#eab308" opacity="0.8" style={animated ? { animation: 'shine-glow 2s infinite alternate ease-in-out', animationDelay: '0.5s' } : {}} />
        </svg>
    );
};

// 3. GLADIATOR (gladiator)
export const GladiatorBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(234, 179, 8, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#ca8a04" />
                    <stop offset="100%" stopColor="#854d0e" />
                </linearGradient>
                <linearGradient id="swordGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#cbd5e1" />
                    <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
                <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Outer Circular Laurel / Wreath Backdrop */}
            <circle cx="50" cy="50" r="41" stroke="#ca8a04" strokeWidth="2.5" strokeDasharray="5 5" opacity="0.6" />

            {/* Crossed Swords */}
            <g style={animated ? { animation: 'sword-clang 2s infinite ease-in-out', transformOrigin: '50px 50px' } : {}}>
                {/* Sword 1 */}
                <g transform="rotate(45 50 50)">
                    <rect x="47" y="10" width="6" height="65" fill="url(#swordGrad)" rx="1" />
                    <rect x="42" y="62" width="16" height="4" fill="#ca8a04" rx="1" />
                    <rect x="48" y="66" width="4" height="15" fill="#475569" rx="1" />
                    <circle cx="50" cy="82" r="3" fill="#ca8a04" />
                </g>
                {/* Sword 2 */}
                <g transform="rotate(-45 50 50)">
                    <rect x="47" y="10" width="6" height="65" fill="url(#swordGrad)" rx="1" />
                    <rect x="42" y="62" width="16" height="4" fill="#ca8a04" rx="1" />
                    <rect x="48" y="66" width="4" height="15" fill="#475569" rx="1" />
                    <circle cx="50" cy="82" r="3" fill="#ca8a04" />
                </g>
            </g>

            {/* Shield Over Swords */}
            <g style={animated ? { animation: 'float-badge 2s infinite ease-in-out' } : {}}>
                <path d="M50 22 C64 22, 72 27, 72 45 C72 65, 50 82, 50 82 C50 82, 28 65, 28 45 C28 27, 36 22, 50 22 Z" fill="url(#shieldGrad)" stroke="#fef08a" strokeWidth="2" filter="url(#goldGlow)" />
                {/* Shield Inner Star */}
                <path d="M50 35 L53 44 L62 44 L55 49 L58 58 L50 52 L42 58 L45 49 L38 44 L47 44 Z" fill="#fef08a" />
            </g>
        </svg>
    );
};

// Generic Marksman Badge Builder (Bronze, Silver, Gold targets)
const MarksmanBadge = ({ size = 64, colorGrad, strokeColor, glowColor, badgeLevel, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': glowColor } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id={`markGrad-${badgeLevel}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    {colorGrad}
                </linearGradient>
                <filter id={`markGlow-${badgeLevel}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Target Ring 1 */}
            <circle cx="50" cy="50" r="38" stroke={strokeColor} strokeWidth="2" strokeDasharray={badgeLevel === 'gold' ? 'none' : '4 4'} opacity="0.8" filter={`url(#markGlow-${badgeLevel})`} />

            {/* Target Ring 2 */}
            <circle cx="50" cy="50" r="26" stroke={strokeColor} strokeWidth="1.5" />
            
            {/* Target Ring 3 (Inner bullseye ring) */}
            <circle cx="50" cy="50" r="14" fill={`url(#markGrad-${badgeLevel})`} stroke={strokeColor} strokeWidth="1.5" fillOpacity="0.15" />

            {/* Crosshair Lines */}
            <line x1="50" y1="6" x2="50" y2="94" stroke={strokeColor} strokeWidth="2" strokeDasharray="3 3" opacity="0.5" />
            <line x1="6" y1="50" x2="94" y2="50" stroke={strokeColor} strokeWidth="2" strokeDasharray="3 3" opacity="0.5" />

            {/* Center Bullseye Core */}
            <circle cx="50" cy="50" r="8" fill={`url(#markGrad-${badgeLevel})`} style={animated ? { animation: 'flame-flicker 1.5s infinite alternate ease-in-out' } : {}} />
            <circle cx="50" cy="50" r="3" fill="#ffffff" />

            {/* Level Laurel accents for Gold Marksman */}
            {badgeLevel === 'gold' && (
                <path d="M12 50 C12 30, 25 14, 50 14 C75 14, 88 30, 88 50" stroke="#fef08a" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            )}
        </svg>
    );
};

// 4. BRONZE MARKSMAN (accuracy_50)
export const BronzeMarksmanBadge = ({ size = 64, animated = true }) => {
    return (
        <MarksmanBadge 
            size={size}
            animated={animated}
            badgeLevel="bronze"
            strokeColor="#b45309"
            glowColor="rgba(180, 83, 9, 0.5)"
            colorGrad={<><stop offset="0%" stopColor="#d97706" /><stop offset="100%" stopColor="#78350f" /></>}
        />
    );
};

// 5. SILVER MARKSMAN (accuracy_75)
export const SilverMarksmanBadge = ({ size = 64, animated = true }) => {
    return (
        <MarksmanBadge 
            size={size}
            animated={animated}
            badgeLevel="silver"
            strokeColor="#94a3b8"
            glowColor="rgba(148, 163, 184, 0.5)"
            colorGrad={<><stop offset="0%" stopColor="#cbd5e1" /><stop offset="100%" stopColor="#475569" /></>}
        />
    );
};

// 6. GOLD MARKSMAN (accuracy_100)
export const GoldMarksmanBadge = ({ size = 64, animated = true }) => {
    return (
        <MarksmanBadge 
            size={size}
            animated={animated}
            badgeLevel="gold"
            strokeColor="#ca8a04"
            glowColor="rgba(234, 179, 8, 0.6)"
            colorGrad={<><stop offset="0%" stopColor="#fef08a" /><stop offset="100%" stopColor="#854d0e" /></>}
        />
    );
};

// 7. REASONING MASTER (master_reasoning)
export const ReasoningMasterBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(168, 85, 247, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#581c87" />
                </linearGradient>
                <filter id="purpleGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Glowing Hexagonal Frame */}
            <polygon points="50,12 85,30 85,70 50,88 15,70 15,30" stroke="#c084fc" strokeWidth="2" fill="url(#purpleGrad)" fillOpacity="0.05" filter="url(#purpleGlow)" />
            <polygon points="50,17 80,33 80,67 50,83 20,67 20,33" stroke="#a855f7" strokeWidth="1" opacity="0.5" />

            {/* Logic Nodes puzzle drawing */}
            <g style={animated ? { animation: 'float-badge 2.5s infinite ease-in-out' } : {}}>
                {/* Node Lines */}
                <line x1="35" y1="42" x2="50" y2="30" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear' } : {}} />
                <line x1="65" y1="42" x2="50" y2="30" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear', animationDelay: '1s' } : {}} />
                <line x1="35" y1="42" x2="35" y2="60" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear', animationDelay: '2s' } : {}} />
                <line x1="65" y1="42" x2="65" y2="60" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear', animationDelay: '1.5s' } : {}} />
                <line x1="35" y1="60" x2="50" y2="70" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear', animationDelay: '0.5s' } : {}} />
                <line x1="65" y1="60" x2="50" y2="70" stroke="#f3e8ff" strokeWidth="2" strokeDasharray="30" style={animated ? { animation: 'draw-path 4s infinite linear', animationDelay: '2.5s' } : {}} />
                <line x1="50" y1="30" x2="50" y2="70" stroke="#c084fc" strokeWidth="1.5" opacity="0.6" />
                <line x1="35" y1="42" x2="65" y2="60" stroke="#c084fc" strokeWidth="1.5" opacity="0.6" />

                {/* Node Dots */}
                <circle cx="50" cy="30" r="5" fill="#f3e8ff" stroke="#a855f7" strokeWidth="2" />
                <circle cx="35" cy="42" r="5" fill="#c084fc" stroke="#f3e8ff" strokeWidth="2" />
                <circle cx="65" cy="42" r="5" fill="#c084fc" stroke="#f3e8ff" strokeWidth="2" />
                <circle cx="35" cy="60" r="5" fill="#a855f7" stroke="#f3e8ff" strokeWidth="2" />
                <circle cx="65" cy="60" r="5" fill="#a855f7" stroke="#f3e8ff" strokeWidth="2" />
                <circle cx="50" cy="70" r="5" fill="#f3e8ff" stroke="#a855f7" strokeWidth="2" />
            </g>
        </svg>
    );
};

// 8. QUANT MASTER (master_quant)
export const QuantMasterBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(20, 184, 166, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
                <filter id="tealGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Outer Diamond Box Frame */}
            <rect x="18" y="18" width="64" height="64" rx="12" stroke="#2dd4bf" strokeWidth="2.5" fill="url(#tealGrad)" fillOpacity="0.05" transform="rotate(45 50 50)" filter="url(#tealGlow)" />
            <rect x="22" y="22" width="56" height="56" rx="8" stroke="#14b8a6" strokeWidth="1" transform="rotate(45 50 50)" opacity="0.5" />

            {/* Glowing Sigma symbol and geometry elements */}
            <g style={animated ? { animation: 'float-badge 2s infinite ease-in-out' } : {}}>
                {/* Geometrical Circle backdrop */}
                <circle cx="50" cy="50" r="18" stroke="#5eead4" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                
                {/* Sigma Math Character */}
                <path d="M38 34 L62 34 L48 50 L62 66 L38 66 L38 61 L54 61 L43 50 L54 39 L38 39 Z" fill="#2dd4bf" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
            </g>
        </svg>
    );
};

// 9. ENGLISH MASTER (master_english)
export const EnglishMasterBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(244, 63, 94, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="roseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#be123c" />
                </linearGradient>
                <filter id="roseGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Wreath / Laurel Circular frame */}
            <path d="M22 75 C12 60, 12 40, 22 25 C30 15, 42 12, 50 12 C58 12, 70 15, 78 25 C88 40, 88 60, 78 75 C70 85, 58 88, 50 88 C42 88, 30 85, 22 75 Z" stroke="#fb7185" strokeWidth="2.5" fill="url(#roseGrad)" fillOpacity="0.05" filter="url(#roseGlow)" />

            {/* Quill and Shield emblem */}
            <g style={animated ? { animation: 'float-badge 2.3s infinite ease-in-out' } : {}}>
                {/* Large letter A */}
                <text x="50" y="55" fontFamily="'Outfit', sans-serif" fontSize="26" fontWeight="800" fill="#fecdd3" stroke="#be123c" strokeWidth="1" textAnchor="middle" dominantBaseline="middle">A</text>
                
                {/* Quill / Feather Pen */}
                <g transform="rotate(-30 65 40)">
                    <path d="M60 15 C60 15, 62 25, 58 40 C55 52, 48 57, 48 57 L44 65 L46 56 C46 56, 52 50, 56 38 C59 27, 60 15, 60 15 Z" fill="#ffffff" stroke="#fb7185" strokeWidth="1" />
                    {/* Feather vane lines */}
                    <line x1="57" y1="23" x2="52" y2="28" stroke="#fb7185" strokeWidth="0.75" />
                    <line x1="56" y1="31" x2="50" y2="36" stroke="#fb7185" strokeWidth="0.75" />
                    <line x1="54" y1="39" x2="48" y2="44" stroke="#fb7185" strokeWidth="0.75" />
                </g>
            </g>
        </svg>
    );
};

// 10. GS MASTER (master_gs)
export const GSMasterBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(234, 179, 8, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <defs>
                <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#78350f" />
                </linearGradient>
                <filter id="amberGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Glowing outer circle */}
            <circle cx="50" cy="50" r="38" stroke="#f59e0b" strokeWidth="2.5" fill="url(#amberGrad)" fillOpacity="0.05" filter="url(#amberGlow)" />
            <circle cx="50" cy="50" r="34" stroke="#d97706" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />

            {/* Globe with rotating orbit lines */}
            <g style={animated ? { animation: 'float-badge 2s infinite ease-in-out' } : {}}>
                {/* Globe continents / circles */}
                <circle cx="50" cy="50" r="20" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                {/* Grid latitude/longitude lines */}
                <ellipse cx="50" cy="50" rx="20" ry="8" stroke="#b45309" strokeWidth="1.25" />
                <ellipse cx="50" cy="50" rx="8" ry="20" stroke="#b45309" strokeWidth="1.25" />
                <line x1="30" y1="50" x2="70" y2="50" stroke="#b45309" strokeWidth="1.25" />
                <line x1="50" y1="30" x2="50" y2="70" stroke="#b45309" strokeWidth="1.25" />

                {/* Satellites or Sparkly Orbits */}
                <g style={animated ? { animation: 'orbit-spin 6s infinite linear', transformOrigin: '50px 50px' } : {}}>
                    <ellipse cx="50" cy="50" rx="28" ry="10" stroke="#fbbf24" strokeWidth="1.5" transform="rotate(-30 50 50)" />
                    <circle cx="74" cy="36" r="3" fill="#f59e0b" />
                    <circle cx="26" cy="64" r="3" fill="#f59e0b" />
                </g>
            </g>
        </svg>
    );
};

// 11. NIGHT OWL (night_owl)
export const NightOwlBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(124, 58, 237, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <circle cx="50" cy="50" r="40" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="2" />
            <path d="M50 20 A30 30 0 0 1 80 50 A30 30 0 0 1 50 80 A25 25 0 0 0 50 20 Z" fill="#fde047" opacity="0.9" style={animated ? { animation: 'shine-glow 2s infinite alternate ease-in-out' } : {}} />
            <circle cx="30" cy="40" r="2" fill="#ffffff" />
            <circle cx="70" cy="30" r="1.5" fill="#ffffff" />
            <circle cx="40" cy="70" r="2" fill="#ffffff" />
        </svg>
    );
};

// 12. EARLY BIRD (early_bird)
export const EarlyBirdBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(249, 115, 22, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <circle cx="50" cy="50" r="40" fill="#fff7ed" stroke="#f97316" strokeWidth="2" />
            <path d="M20 60 A30 30 0 0 1 80 60" fill="#facc15" opacity="0.9" style={animated ? { animation: 'float-badge 2.5s infinite ease-in-out' } : {}} />
            <path d="M10 70 L90 70 L90 80 L10 80 Z" fill="#fdba74" />
        </svg>
    );
};

// 13. MARATHONER (marathoner)
export const MarathonerBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(16, 185, 129, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <rect x="20" y="20" width="60" height="60" rx="10" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
            <path d="M40 30 L60 30 L60 70 L40 70 Z" fill="#34d399" opacity="0.3" />
            <path d="M30 40 L70 40 L70 60 L30 60 Z" fill="#059669" opacity="0.5" />
            <circle cx="50" cy="50" r="10" fill="#6ee7b7" style={animated ? { animation: 'shine-glow 1.5s infinite alternate ease-in-out' } : {}} />
        </svg>
    );
};

// 14. UNSTOPPABLE (unstoppable)
export const UnstoppableBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(225, 29, 72, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <circle cx="50" cy="50" r="42" fill="#4c0519" stroke="#e11d48" strokeWidth="2" strokeDasharray="5 5" style={animated ? { animation: 'orbit-spin 10s infinite linear' } : {}} />
            <path d="M50 15 L58 35 L78 35 L62 48 L68 68 L50 55 L32 68 L38 48 L22 35 L42 35 Z" fill="#fb7185" style={animated ? { animation: 'flame-flicker 2s infinite alternate ease-in-out' } : {}} />
        </svg>
    );
};

// 15. FLAWLESS VICTORY (flawless_victory)
export const FlawlessVictoryBadge = ({ size = 64, animated = true }) => {
    const animationStyle = animated ? { animation: 'badge-pulse 3s infinite ease-in-out', '--glow-color': 'rgba(253, 224, 71, 0.6)' } : {};
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ ...animationStyle, overflow: 'visible' }}>
            <polygon points="50,15 85,35 85,75 50,95 15,75 15,35" fill="#713f12" stroke="#fde047" strokeWidth="2" />
            <polygon points="50,25 75,40 75,70 50,85 25,70 25,40" fill="#ca8a04" opacity="0.6" style={animated ? { animation: 'shine-glow 2s infinite alternate ease-in-out' } : {}} />
            <path d="M35 50 L45 60 L65 40" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export const Streak10Badge = ({ size, animated }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{
        overflow: 'visible',
        animation: animated ? 'badge-pulse 2s infinite ease-in-out' : 'none',
        '--glow-color': 'rgba(239, 68, 68, 0.4)'
    }}>
        <defs>
            <linearGradient id="streak10Grad" x1="0" y1="0" x2="100" y2="100">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="flameGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#streak10Grad)" />
        <circle cx="50" cy="50" r="38" fill="#1e1e1e" />
        <path d="M50 25 C30 45, 35 65, 50 75 C65 65, 70 45, 50 25 Z" fill="url(#streak10Grad)" filter="url(#flameGlow)" style={{ transformOrigin: '50% 50%', animation: animated ? 'flame-flicker 1.5s infinite ease-in-out' : 'none' }} />
        <text x="50" y="62" fontFamily="sans-serif" fontSize="24" fontWeight="bold" fill="#ffffff" textAnchor="middle">10</text>
    </svg>
);

export const Roast0PercentBadge = ({ size, animated }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{
        overflow: 'visible',
        animation: animated ? 'float-badge 3s infinite ease-in-out' : 'none'
    }}>
        <defs>
            <linearGradient id="roast0Grad" x1="0" y1="0" x2="100" y2="100">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#roast0Grad)" />
        <circle cx="50" cy="50" r="38" fill="#0f172a" />
        <text x="50" y="65" fontFamily="sans-serif" fontSize="45" fontWeight="bold" fill="#0ea5e9" textAnchor="middle">0%</text>
        <path d="M25 25 L75 75 M75 25 L25 75" stroke="#0ea5e9" strokeWidth="4" opacity="0.5" />
    </svg>
);

export const RoastSlowpokeBadge = ({ size, animated }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ overflow: 'visible' }}>
        <defs>
            <linearGradient id="slowpokeGrad" x1="0" y1="0" x2="100" y2="100">
                <stop offset="0%" stopColor="#84cc16" />
                <stop offset="100%" stopColor="#4d7c0f" />
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#slowpokeGrad)" />
        <circle cx="50" cy="50" r="38" fill="#1e293b" />
        <text x="50" y="60" fontFamily="sans-serif" fontSize="30" fontWeight="bold" fill="#84cc16" textAnchor="middle">Zzz</text>
    </svg>
);

export const RoastStreakWrongBadge = ({ size, animated }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ overflow: 'visible' }}>
        <defs>
            <linearGradient id="wrongGrad" x1="0" y1="0" x2="100" y2="100">
                <stop offset="0%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#7f1d1d" />
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#wrongGrad)" />
        <circle cx="50" cy="50" r="38" fill="#1e1e1e" />
        <path d="M35 35 L65 65 M65 35 L35 65" stroke="#dc2626" strokeWidth="10" strokeLinecap="round" />
    </svg>
);

export const RoastBlindGuesserBadge = ({ size, animated }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ overflow: 'visible' }}>
        <defs>
            <linearGradient id="blindGrad" x1="0" y1="0" x2="100" y2="100">
                <stop offset="0%" stopColor="#9333ea" />
                <stop offset="100%" stopColor="#4c1d95" />
            </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#blindGrad)" />
        <circle cx="50" cy="50" r="38" fill="#1e1e1e" />
        <text x="50" y="65" fontFamily="sans-serif" fontSize="45" fontWeight="bold" fill="#9333ea" textAnchor="middle">?</text>
        <circle cx="35" cy="50" r="4" fill="#9333ea" />
        <circle cx="65" cy="50" r="4" fill="#9333ea" />
    </svg>
);

// Main Resolver component mapping key -> SVG component
const BadgeIcon = ({ badgeKey, size = 64, animated = true }) => {
    switch (badgeKey) {
        case 'speed_demon':
            return <SpeedDemonBadge size={size} animated={animated} />;
        case 'dedicated_learner':
            return <DedicatedLearnerBadge size={size} animated={animated} />;
        case 'gladiator':
            return <GladiatorBadge size={size} animated={animated} />;
        case 'accuracy_50':
            return <BronzeMarksmanBadge size={size} animated={animated} />;
        case 'accuracy_75':
            return <SilverMarksmanBadge size={size} animated={animated} />;
        case 'accuracy_100':
            return <GoldMarksmanBadge size={size} animated={animated} />;
        case 'master_reasoning':
            return <ReasoningMasterBadge size={size} animated={animated} />;
        case 'master_quant':
            return <QuantMasterBadge size={size} animated={animated} />;
        case 'master_english':
            return <EnglishMasterBadge size={size} animated={animated} />;
        case 'master_gs':
            return <GSMasterBadge size={size} animated={animated} />;
        case 'night_owl':
            return <NightOwlBadge size={size} animated={animated} />;
        case 'early_bird':
            return <EarlyBirdBadge size={size} animated={animated} />;
        case 'marathoner':
            return <MarathonerBadge size={size} animated={animated} />;
        case 'unstoppable':
            return <UnstoppableBadge size={size} animated={animated} />;
        case 'flawless_victory':
            return <FlawlessVictoryBadge size={size} animated={animated} />;
        case 'streak_10':
            return <Streak10Badge size={size} animated={animated} />;
        case 'roast_0_percent':
            return <Roast0PercentBadge size={size} animated={animated} />;
        case 'roast_slowpoke':
            return <RoastSlowpokeBadge size={size} animated={animated} />;
        case 'roast_streak_wrong':
            return <RoastStreakWrongBadge size={size} animated={animated} />;
        case 'roast_blind_guesser':
            return <RoastBlindGuesserBadge size={size} animated={animated} />;
        default:
            // Generic Fallback
            return (
                <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ overflow: 'visible' }}>
                    <circle cx="50" cy="50" r="38" stroke="#64748b" strokeWidth="2" />
                    <text x="50" y="55" fontFamily="sans-serif" fontSize="30" fill="#64748b" textAnchor="middle">?</text>
                </svg>
            );
    }
};

export default BadgeIcon;
