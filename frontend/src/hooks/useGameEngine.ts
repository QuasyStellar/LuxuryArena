import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * SQUARE DETERMINISTIC PHYSICS MIRROR
 */
class DeterministicPhysics {
    width: number = 600;
    height: number = 600;
    radius: number = 15;
    friction: number = 0.998;

    step(p: any) {
        p.x += p.vx; p.y += p.vy;
        const buffer = 10; // Match backend exactly
        const minX = this.radius + buffer;
        const maxX = this.width - this.radius - buffer;
        const minY = this.radius + buffer;
        const maxY = this.height - this.radius - buffer;
        if (p.x < minX) { p.x = minX; p.vx = Math.abs(p.vx); }
        if (p.x > maxX) { p.x = maxX; p.vx = -Math.abs(p.vx); }
        if (p.y < minY) { p.y = minY; p.vy = Math.abs(p.vy); }
        if (p.y > maxY) { p.y = maxY; p.vy = -Math.abs(p.vy); }
        p.vx *= this.friction; p.vy *= this.friction;
        return p;
    }
}

export const useGameEngine = () => {
    const socketRef = useRef<Socket | null>(null);
    const physics = useRef(new DeterministicPhysics());
    const [state, setState] = useState<any>({
        phase: 'BETTING', timer: 15, players: [], winner: null, initialImpulse: null, mode: 'REAL'
    });

    const [visualPuck, setVisualPuck] = useState({ x: 300, y: 300, angle: 0, isLaunching: false, launchProgress: 0 });
    const localPuck = useRef({ x: 300, y: 300, vx: 0, vy: 0, angle: 0 });
    const phaseRef = useRef('BETTING');
    const modeRef = useRef('REAL');
    const isRolling = useRef(false);
    const isLaunchingRef = useRef(false);
    const launchStart = useRef(0);

    useEffect(() => {
        const socket = io();
        socketRef.current = socket;

        socket.on('sync', (snapshot) => {
            const modeChanged = modeRef.current !== snapshot.mode;
            modeRef.current = snapshot.mode;
            
            setState(snapshot);
            phaseRef.current = snapshot.phase;

            if (snapshot.phase === 'ROLL') {
                // If we just entered the room or match just started locally
                if (modeChanged || !isRolling.current) {
                    localPuck.current = { 
                        x: snapshot.puck.x, 
                        y: snapshot.puck.y, 
                        vx: snapshot.puck.vx, 
                        vy: snapshot.puck.vy, 
                        angle: localPuck.current.angle 
                    };
                    isRolling.current = true;
                    isLaunchingRef.current = false;
                }
            } else if (snapshot.phase === 'STARTING') {
                if (modeChanged || !isLaunchingRef.current) {
                    launchStart.current = performance.now();
                    isLaunchingRef.current = true;
                }
                isRolling.current = false;
                localPuck.current = { 
                    x: snapshot.puck.x, 
                    y: snapshot.puck.y, 
                    vx: 0, vy: 0, angle: snapshot.puck.angle 
                };
            } else if (snapshot.phase === 'BETTING') {
                isRolling.current = false;
                isLaunchingRef.current = false;
                localPuck.current = { x: 300, y: 300, vx: 0, vy: 0, angle: 0 };
            }
        });

        const frame = () => {
            const lp = localPuck.current;
            const currentPhase = phaseRef.current;

            if (currentPhase === 'STARTING') {
                const duration = 4500;
                const elapsed = performance.now() - launchStart.current;
                const progress = Math.min(1, elapsed / duration);
                
                const targetAngle = lp.angle;
                const totalSpins = 8;
                const totalRotationNeeded = (Math.PI * 2 * totalSpins) + targetAngle;
                
                // CUBIC EASE OUT: 1 - (1 - x)^3 -> starts faster, slows down sooner
                const cubicEaseOut = 1 - Math.pow(1 - progress, 3);
                const currentRotation = cubicEaseOut * totalRotationNeeded;
                
                setVisualPuck({ x: lp.x, y: lp.y, angle: currentRotation, isLaunching: true, launchProgress: progress });
            } else if (currentPhase === 'ROLL' || isRolling.current) {

                const speedSq = lp.vx * lp.vx + lp.vy * lp.vy;
                if (speedSq > 0.0001) {
                    for (let i = 0; i < 4; i++) physics.current.step(lp);
                    lp.angle += Math.sqrt(speedSq) * 0.05;
                }
                setVisualPuck({ x: lp.x, y: lp.y, angle: lp.angle, isLaunching: false, launchProgress: 1 });
            } else {
                setVisualPuck({ x: 300, y: 300, angle: 0, isLaunching: false, launchProgress: 0 });
            }
            requestAnimationFrame(frame);
        };
        
        const animId = requestAnimationFrame(frame);
        return () => { socket.disconnect(); cancelAnimationFrame(animId); };
    }, []);

    const joinMatch = (bet: number, name: string) => {
        socketRef.current?.emit('join_match', { bet, name });
    };

    const setMode = (mode: 'DEMO' | 'REAL') => {
        socketRef.current?.emit('set_mode', mode);
    };

    return { ...state, puckPos: visualPuck, joinMatch, setMode, ARENA_SIZE: 600, initialImpulse: state.initialImpulse };
};
