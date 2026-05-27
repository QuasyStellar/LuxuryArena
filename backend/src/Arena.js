const crypto = require('crypto');

/**
 * SHARED DETERMINISTIC PHYSICS
 */
class DeterministicPhysics {
    constructor() {
        this.width = 600;
        this.height = 600;
        this.radius = 15;
        this.friction = 0.998; 
    }

    step(state) {
        if (!state) return { x: 300, y: 300, vx: 0, vy: 0 };
        let { x, y, vx, vy } = state;
        
        const buffer = 10; // Safe buffer to prevent visual clipping
        const minX = this.radius + buffer;
        const maxX = this.width - this.radius - buffer;
        const minY = this.radius + buffer;
        const maxY = this.height - this.radius - buffer;

        x += vx;
        y += vy;

        if (x < minX) { x = minX; vx = Math.abs(vx); }
        if (x > maxX) { x = maxX; vx = -Math.abs(vx); }
        if (y < minY) { y = minY; vy = Math.abs(vy); }
        if (y > maxY) { y = maxY; vy = -Math.abs(vy); }

        vx *= this.friction; 
        vy *= this.friction;
        
        return { x, y, vx, vy };
    }

    simulateUntilStop(initialState) {
        let state = { ...initialState };
        let ticks = 0;
        while (ticks < 8000) {
            for (let i = 0; i < 4; i++) state = this.step(state);
            ticks++;
            if (state.vx * state.vx + state.vy * state.vy < 0.0001) break;
        }
        return state;
    }
}

class Arena {
    constructor(mode = 'DEMO') {
        this.physics = new DeterministicPhysics();
        this.mode = mode;
        this.reset();
    }

    reset() {
        this.serverSeed = crypto.randomBytes(32).toString('hex');
        this.state = {
            phase: 'BETTING',
            timer: 15,
            serverSeedHash: crypto.createHash('sha256').update(this.serverSeed).digest('hex'),
            players: [],
            winner: null,
            initialImpulse: null,
            resultFloat: null,
            puck: { x: 300, y: 300, vx: 0, vy: 0, angle: 0 }
        };

        if (this.mode === 'DEMO') {
            const botCount = Math.floor(Math.random() * 4) + 3;
            for (let i = 1; i <= botCount; i++) {
                const randomBet = Math.floor(Math.random() * 1000) + 100;
                this.addPlayer(`bot-${i}`, `Bot ${i}`, randomBet, true);
            }
        }
    }

    addPlayer(id, name, bet, isBot = false) {
        let p = this.state.players.find(player => player.id === id);
        if (p) {
            p.bet += Number(bet) || 100;
        } else {
            const index = this.state.players.length;
            
            // DETERMINISTIC HASH FOR COLOR AND NAME
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
                hash = ((hash << 5) - hash) + id.charCodeAt(i);
                hash |= 0; 
            }

            // GOLDEN ANGLE SPIRAL DISTRIBUTION (Stable and spread out)
            const phi = (Math.sqrt(5) + 1) / 2; 
            const angle = index * 2 * Math.PI * (1 - 1/phi);
            const radius = 40 + Math.sqrt(index + 1) * 45; 
            
            const rngX = 300 + Math.cos(angle) * radius;
            const rngY = 300 + Math.sin(angle) * radius;
            const point = [rngX, rngY];

            const luxuryNames = ['Magnate', 'Tycoon', 'Sovereign', 'High Roller', 'Baron', 'Monarch', 'Grandee', 'Elite'];
            
            const nameIdx = Math.abs(hash) % luxuryNames.length;
            const defaultName = `${luxuryNames[nameIdx]} #${id.substring(0, 4).toUpperCase()}`;

            p = {
                id, name: name || defaultName,
                bet: Number(bet) || 100,
                color: `hsl(${Math.random() * 360}, 85%, 60%)`,
                isBot,
                index: index,
                point,
                weight: 0
            };
            this.state.players.push(p);
        }
        this.solveWeights();
    }

    solveWeights() {
        const players = this.state.players;
        if (players.length === 0) return;

        const totalBet = players.reduce((s, p) => s + p.bet, 0);
        const res = 120; // Increased resolution
        const totalArea = res * res;
        const targetAreas = players.map(p => (p.bet / totalBet) * totalArea);

        const step = 600 / res;
        players.forEach(p => p.weight = 0);

        const iterations = 600; // Increased iterations for precision
        const learningRate = 1500.0; 

        for (let iter = 0; iter < iterations; iter++) {
            const counts = new Uint32Array(players.length);
            for (let y = 0; y < res; y++) {
                const py = y * step + step / 2;
                for (let x = 0; x < res; x++) {
                    const px = x * step + step / 2;
                    let minDist = Infinity;
                    let bestIdx = 0;
                    for (let i = 0; i < players.length; i++) {
                        const dx = px - players[i].point[0];
                        const dy = py - players[i].point[1];
                        const d = (dx * dx + dy * dy) - players[i].weight;
                        if (d < minDist) { minDist = d; bestIdx = i; }
                    }
                    counts[bestIdx]++;
                }
            }

            let maxErr = 0;
            for (let i = 0; i < players.length; i++) {
                const err = (targetAreas[i] - counts[i]) / totalArea;
                players[i].weight += err * learningRate;
                maxErr = Math.max(maxErr, Math.abs(err));
            }
            if (maxErr < 0.0001) break;
        }
    }

    startMatch(clientSeed) {
        if (this.state.players.length === 0) return;
        this.state.clientSeed = clientSeed;
        this.state.resultFloat = this.calculateResult(this.serverSeed, clientSeed);
        
        // Find winner based on weighted distance from center
        const players = this.state.players;
        const res = 100;
        const step = 600 / res;
        const counts = new Array(players.length).fill(0);
        
        for (let y = 0; y < res; y++) {
            for (let x = 0; x < res; x++) {
                const px = x * step + step / 2;
                const py = y * step + step / 2;
                let minDist = Infinity;
                let bestIdx = 0;
                for (let i = 0; i < players.length; i++) {
                    const dx = px - players[i].point[0];
                    const dy = py - players[i].point[1];
                    const d = (dx * dx + dy * dy) - players[i].weight;
                    if (d < minDist) { minDist = d; bestIdx = i; }
                }
                counts[bestIdx]++;
            }
        }

        const totalArea = res * res;
        let cumulative = 0;
        let winningPlayer = players[0];
        for (let i = 0; i < players.length; i++) {
            cumulative += counts[i] / totalArea;
            if (this.state.resultFloat <= cumulative) {
                winningPlayer = players[i];
                break;
            }
        }

        this.state.winner = winningPlayer;

        // BRUTE FORCE PHYSICS TO LAND ON WINNER
        const startX = 100 + Math.random() * 400;
        const startY = 100 + Math.random() * 400;
        this.state.startPos = { x: startX, y: startY };

        let found = false;
        let attempts = 0;
        let finalLaunchAngle = 0;
        while (!found && attempts < 3000) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 12 + Math.random() * 8;
            const impulse = { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
            // Simulate from the random start position
            const final = this.physics.simulateUntilStop({ x: startX, y: startY, ...impulse });
            const landedOwner = this.getOwnerAt(final.x, final.y);
            if (landedOwner && landedOwner.id === winningPlayer.id) {
                this.state.initialImpulse = impulse;
                finalLaunchAngle = angle;
                found = true;
            }
            attempts++;
        }
        if (!found) {
            this.state.initialImpulse = { vx: 5, vy: 5 };
            finalLaunchAngle = Math.PI / 4;
        }
        
        // Setup initial puck at random start for intro
        this.state.puck = { x: startX, y: startY, vx: 0, vy: 0, angle: finalLaunchAngle };
        this.state.phase = 'STARTING';
        this.state.tick = 0;
    }

    getOwnerAt(x, y) {
        const players = this.state.players;
        let minDist = Infinity;
        let ownerIdx = -1;
        for (let i = 0; i < players.length; i++) {
            const dx = x - players[i].point[0];
            const dy = y - players[i].point[1];
            const d = (dx * dx + dy * dy) - players[i].weight;
            if (d < minDist) { minDist = d; ownerIdx = i; }
        }
        return players[ownerIdx];
    }

    tick() {
        if (this.state.phase !== 'ROLL') return;
        for (let i = 0; i < 4; i++) {
            this.state.puck = this.physics.step(this.state.puck);
        }
        this.state.tick++;

        const speedSq = this.state.puck.vx * this.state.puck.vx + this.state.puck.vy * this.state.puck.vy;
        if (speedSq < 0.0001) {
            this.state.phase = 'FINISHED';
            this.state.timer = 6;
        }
    }

    calculateResult(serverSeed, clientSeed) {
        const hash = crypto.createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
        return parseInt(hash.substring(0, 8), 16) / 0xffffffff;
    }

    getSnapshot() { 
        const snap = { ...this.state, mode: this.mode };
        // HIDE SENSITIVE DATA UNTIL FINISHED
        if (this.state.phase !== 'FINISHED') {
            delete snap.winner;
            delete snap.serverSeed;
            delete snap.resultFloat;
            delete snap.clientSeed;
        }
        return snap;
    }
}

module.exports = Arena;
