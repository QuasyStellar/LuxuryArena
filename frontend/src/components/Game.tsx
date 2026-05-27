import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useGameEngine } from '../hooks/useGameEngine';

const translations: any = {
  en: {
    demo: "DEMO",
    pvp: "PVP",
    phase: "Phase",
    serverHash: "Hash",
    provablyFair: "Provably Fair",
    revealedSeed: "Seed",
    champion: "Winner",
    identity: "NAME",
    enter: "Join",
    bot: "BOT",
    waiting: "Waiting...",
    BETTING: "Betting",
    STARTING_PRE: "Starting",
    STARTING: "Launch",
    ROLL: "Rolling",
    FINISHED: "Results"
  },
  ru: {
    demo: "ДЕМО",
    pvp: "ПВП",
    phase: "Фаза",
    serverHash: "Хэш",
    provablyFair: "Честная игра",
    revealedSeed: "Сид",
    champion: "Победитель",
    identity: "ИМЯ",
    enter: "Играть",
    bot: "БОТ",
    waiting: "Ожидание...",
    BETTING: "Ставки",
    STARTING_PRE: "Запуск",
    STARTING: "Старт",
    ROLL: "Бросок",
    FINISHED: "Итоги"
  }
};

const Game: React.FC = () => {
  const { 
    players, phase, timer, serverSeedHash, serverSeed,
    winner, puckPos, joinMatch, setMode, mode
  } = useGameEngine();
  
  const [lang, setLang] = useState<'en' | 'ru'>('ru');
  const t = translations[lang];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);

  const ARENA_SIZE = 600;

  const bgCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = ARENA_SIZE; c.height = ARENA_SIZE;
    return c;
  }, []);

  const playerColors = useMemo(() => {
    const hslToRgb = (h: number, s: number, l: number) => {
        s /= 100; l /= 100;
        const k = (n: number) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return `rgb(${Math.round(255 * f(0))}, ${Math.round(255 * f(8))}, ${Math.round(255 * f(4))})`;
    };
    const colors: Record<number, string> = {};
    if (players) {
        players.forEach((p: any) => {
            const match = p.color.match(/hsl\((\d+\.?\d*),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) colors[p.index] = hslToRgb(parseFloat(match[1]), parseInt(match[2]), parseInt(match[3]));
        });
    }
    return colors;
  }, [players]);

  const drawState = useRef({
    players: [] as any[],
    puck: { x: 300, y: 300, angle: 0, isLaunching: false, launchProgress: 0 },
    phase: 'BETTING',
    ready: false
  });

  useEffect(() => {
    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;

    if (!players || players.length === 0) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
        drawState.current.players = [];
        drawState.current.ready = true;
        return;
    }

    const res = ARENA_SIZE; 
    const imgData = ctx.createImageData(res, res);
    const data = imgData.data;

    const centroids = players.map(() => ({ sumX: 0, sumY: 0, count: 0 }));
    const pPoints = players.map((p: any) => p.point);
    const pWeights = players.map((p: any) => p.weight || 0);
    const pCount = players.length;

    const pRGBs = players.map((p: any) => {
        const color = playerColors[p.index];
        const match = color?.match(/\d+/g);
        return match ? [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])] : [40, 40, 40];
    });

    for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
            let minPD = Infinity;
            let bestIdx = 0;
            for (let i = 0; i < pCount; i++) {
                const dx = x - pPoints[i][0];
                const dy = y - pPoints[i][1];
                const pd = (dx * dx + dy * dy) - pWeights[i];
                if (pd < minPD) { minPD = pd; bestIdx = i; }
            }
            const offset = (y * res + x) * 4;
            centroids[bestIdx].sumX += x;
            centroids[bestIdx].sumY += y;
            centroids[bestIdx].count++;
            const rgb = pRGBs[bestIdx];
            data[offset] = rgb[0];
            data[offset+1] = rgb[1];
            data[offset+2] = rgb[2];
            data[offset+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    drawState.current.players = players.map((p: any, i: number) => {
        let cx = 300, cy = 300;
        if (centroids[i].count > 5) {
            cx = centroids[i].sumX / centroids[i].count;
            cy = centroids[i].sumY / centroids[i].count;
        }
        return { ...p, visualPoint: [Math.max(40, Math.min(560, cx)), Math.max(40, Math.min(560, cy))] };
    });
    drawState.current.ready = true;
  }, [players, playerColors, bgCanvas]);

  useEffect(() => {
    drawState.current.puck = puckPos;
    drawState.current.phase = phase;
  }, [puckPos, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // HIDPI SUPPORT
    const dpr = window.devicePixelRatio || 2;
    canvas.width = ARENA_SIZE * dpr;
    canvas.height = ARENA_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const render = () => {
      const { puck: currentPuck, players: currentPlayers, phase: currentPhase, ready } = drawState.current;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

      if (ready && currentPlayers.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(bgCanvas, 0, 0);
        ctx.restore();

        currentPlayers.forEach((p: any) => {
            const [x, y] = p.visualPoint || [300, 300];
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 30;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, x, y - 24);
        });
      }

      if (currentPhase === 'STARTING' || currentPhase === 'ROLL' || currentPhase === 'FINISHED') {
        if (currentPuck.isLaunching) {
            ctx.save();
            ctx.translate(currentPuck.x, currentPuck.y); 
            ctx.rotate(currentPuck.angle); 
            
            // LUXURY POINTER SHAPE
            ctx.beginPath();
            ctx.moveTo(30, 0);
            ctx.lineTo(50, -12);
            ctx.lineTo(85, 0);
            ctx.lineTo(50, 12);
            ctx.closePath();

            const grad = ctx.createLinearGradient(30, 0, 85, 0);
            grad.addColorStop(0, '#B8860B');
            grad.addColorStop(0.5, '#D4AF37');
            grad.addColorStop(1, '#FFFACD');
            
            ctx.fillStyle = grad;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#D4AF37';
            ctx.fill();
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.restore();
        }

        ctx.save();
        ctx.translate(currentPuck.x, currentPuck.y);
        ctx.rotate(currentPuck.angle || 0);
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 4; 
        ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
        ctx.moveTo(0, -10); ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(render);
    };

    const animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [bgCanvas]);

  useEffect(() => {
    const handleResize = () => {
      const winWidth = window.innerWidth - 32;
      const targetSize = Math.min(winWidth, 600);
      setScale(targetSize / 600);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [bet, setBet] = useState('500');
  const [name, setName] = useState('');

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#050505] text-stone-200 p-4 font-sans selection:bg-amber-500/30 overflow-x-hidden text-center pb-24">
      
      {/* HEADER WITH LOGO AND LANGUAGE */}
      <div className="w-full max-w-xl flex items-center justify-between mb-8 mt-4">
        <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white uppercase leading-none">
          Luxury<span className="text-[#D4AF37]">Arena</span>
        </h1>
        <div className="flex gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
          <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${lang === 'en' ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>EN</button>
          <button onClick={() => setLang('ru')} className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${lang === 'ru' ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>RU</button>
        </div>
      </div>

      {/* MODE SELECTOR */}
      <div className="flex gap-3 mb-8 w-full max-w-xl">
          <button 
            onClick={() => setMode('REAL')}
            className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all ${mode === 'REAL' ? 'bg-[#D4AF37] text-black shadow-[0_0_25px_rgba(212,175,55,0.3)]' : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'}`}>
            {t.pvp}
          </button>
          <button 
            onClick={() => setMode('DEMO')}
            className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all ${mode === 'DEMO' ? 'bg-[#D4AF37] text-black shadow-[0_0_25px_rgba(212,175,55,0.4)]' : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'}`}>
            {t.demo}
          </button>
      </div>

      {/* PHASE & HASH INFO */}
      <div className="w-full border border-[#D4AF37]/10 rounded-2xl overflow-hidden bg-stone-900/40 backdrop-blur-xl mb-6 shadow-2xl" 
           style={{ maxWidth: 600 * scale }}>
        <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${phase === 'BETTING' ? 'bg-green-500' : 'bg-[#D4AF37]'}`}></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">{t.phase}: {t[phase]}</span>
                </div>
                {phase === 'BETTING' && (
                    <span className="text-2xl font-black text-white leading-none tabular-nums">00:{timer < 10 ? `0${timer}` : timer}</span>
                )}
            </div>
            
            <div className="p-4 flex flex-col gap-3 text-left">
                <div className="flex flex-col gap-1">
                    <p className="text-stone-500 text-[8px] uppercase tracking-widest">{t.serverHash}</p>
                    <p className="text-[10px] text-stone-300 break-all font-mono font-bold leading-tight opacity-80">{serverSeedHash}</p>
                </div>

                {phase === 'FINISHED' && serverSeed && (
                    <div className="pt-3 border-t border-white/5 animate-in slide-in-from-top-2 duration-500">
                        <p className="text-[#D4AF37] font-black text-[9px] mb-1 uppercase tracking-widest">{t.provablyFair}</p>
                        <p className="text-[10px] text-white font-mono break-all selection:bg-[#D4AF37] selection:text-black">{serverSeed}</p>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      {/* ARENA CONTAINER */}
      <div className="relative w-full flex justify-center items-center py-2" style={{ height: 600 * scale + 20 }}>
        <div className="relative aspect-square border-2 md:border-4 border-[#D4AF37]/20 bg-black rounded-3xl md:rounded-[2.5rem] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]"
             style={{ width: 600 * scale, height: 600 * scale }}>
            
            <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-[1.5rem] md:rounded-[2rem] overflow-hidden"
                 style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <canvas ref={canvasRef} style={{ width: 600, height: 600, imageRendering: 'auto' }} />
                
                {(!players || players.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px] z-10 text-center px-4">
                         <span className="text-[#D4AF37]/40 text-[40px] md:text-[60px] font-black uppercase tracking-[0.2em] animate-pulse italic">{t.waiting}</span>
                    </div>
                )}

                {phase === 'FINISHED' && winner && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-50 animate-in fade-in zoom-in duration-500">
                        <div className="text-center p-6 md:p-12 w-full px-4 overflow-hidden">
                            <p className="text-[#D4AF37] text-[20px] md:text-[28px] font-black uppercase tracking-[0.5em] mb-6">{t.champion}</p>
                            <h2 className="text-[120px] md:text-[160px] font-black tracking-tighter uppercase leading-[0.9] mb-8 drop-shadow-[0_0_40px_rgba(255,255,255,0.4)] break-words w-full"
                                style={{ color: winner.color }}>{winner.name}</h2>
                            <div className="h-1.5 w-32 bg-[#D4AF37] mx-auto rounded-full shadow-[0_0_20px_rgba(212,175,55,0.5)]"></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="mt-8 w-full max-w-xl flex flex-col gap-6 items-center">
        {phase === 'BETTING' && (
            <div className="flex flex-col items-center animate-in slide-in-from-bottom-4 duration-700 w-full px-2">
                <div className="flex flex-col bg-stone-900/60 border border-white/10 rounded-3xl p-2 backdrop-blur-2xl shadow-2xl focus-within:border-[#D4AF37]/40 transition-all w-full">
                    <div className="flex items-center px-6 py-3 border-b border-white/5 w-full">
                        <input type="text" placeholder={t.identity} value={name} onChange={(e) => setName(e.target.value)}
                               className="bg-transparent text-xs font-black uppercase tracking-widest w-full focus:outline-none text-white placeholder:text-stone-600 text-center"/>
                    </div>
                    <div className="flex items-center px-6 py-4 w-full justify-center">
                        <div className="flex items-center gap-2">
                             <div className="w-10"></div> {/* Spacer to balance currency symbol */}
                             <input type="number" value={bet} onChange={(e) => setBet(e.target.value)}
                                    className="bg-transparent text-3xl md:text-4xl font-black font-mono w-40 focus:outline-none text-white tracking-tighter text-center"/>
                             <span className="text-[#D4AF37] font-mono text-3xl md:text-4xl w-10 text-left">$</span>
                        </div>
                    </div>
                    <button onClick={() => joinMatch(Number(bet), name)}
                            className="w-full py-5 bg-[#D4AF37] hover:bg-[#B8860B] text-black font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-95 shadow-xl shadow-[#D4AF37]/20">
                        {t.enter}
                    </button>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left w-full px-2">
            {players && players.map((p: any) => {
                const currentPool = players.reduce((s: number, pl: any) => s + pl.bet, 0);
                const percent = currentPool > 0 ? ((p.bet / currentPool) * 100).toFixed(1) : "0.0";
                return (
                    <div key={p.id} className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-700 ${p.isBot ? 'bg-stone-900/20 border-white/5' : 'bg-stone-900/60 border-white/10 shadow-lg'}`}>
                        <div className="flex items-start justify-between">
                            <div className="w-1.5 h-6 rounded-full shadow-lg" style={{ backgroundColor: p.color, boxShadow: `0 0 15px ${p.color}88` }}></div>
                            <div className="text-right flex flex-col items-end">
                                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mb-0.5">{percent}%</p>
                                <div className="flex items-center gap-1">
                                    <span className="text-white font-mono font-bold text-lg md:text-xl tracking-tighter">{p.bet.toLocaleString()}</span>
                                    <span className="text-[#D4AF37] font-mono text-lg md:text-xl">$</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-auto">
                            <p className="font-black text-[10px] truncate uppercase tracking-[0.2em] text-stone-400 flex items-center gap-2">
                                {p.name}
                                {p.isBot && <span className="text-[7px] bg-white/5 px-1.5 py-0.5 rounded text-stone-600">{t.bot}</span>}
                            </p>
                            <div className="w-full bg-white/5 h-0.5 mt-2 rounded-full overflow-hidden">
                                <div className="h-full transition-all duration-1000" style={{ width: `${percent}%`, backgroundColor: p.color }}></div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default Game;
