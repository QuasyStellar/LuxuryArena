const Arena = require('./Arena');
const crypto = require('crypto');

class GameManager {
    constructor(io) {
        this.io = io;
        this.arenas = {
            DEMO: new Arena('DEMO'),
            REAL: new Arena('REAL')
        };
        this.socketRooms = new Map(); // socket.id -> 'DEMO' | 'REAL'
        this.startLoops();
    }

    startLoops() {
        // 1. High-frequency Physics Loop (60Hz)
        setInterval(() => {
            Object.values(this.arenas).forEach(arena => {
                if (arena.state.phase === 'ROLL') {
                    arena.tick();
                }
            });
        }, 1000 / 60);

        // 2. State & Timer Management Loop (1Hz)
        setInterval(() => {
            Object.entries(this.arenas).forEach(([mode, arena]) => {
                const state = arena.state;

                if (state.phase === 'BETTING') {
                    // REQUIRE AT LEAST 2 PLAYERS IN REAL MODE TO START TIMER
                    if (mode === 'REAL' && state.players.length < 2) {
                        state.timer = 15; // Reset/Hold timer
                    } else {
                        state.timer--;
                        if (state.timer <= 0) {
                            state.phase = 'STARTING_PRE'; // Temporary lock
                            setImmediate(() => {
                                arena.startMatch(crypto.randomBytes(8).toString('hex'));
                                this.io.to(mode).emit('sync', arena.getSnapshot());
                            });
                        }
                    }
                } else if (state.phase === 'STARTING') {
                    if (!arena.startingTime) arena.startingTime = Date.now();
                    if (Date.now() - arena.startingTime > 4500) {
                        state.phase = 'ROLL';
                        state.puck = { 
                            x: state.startPos.x, 
                            y: state.startPos.y, 
                            vx: state.initialImpulse.vx, 
                            vy: state.initialImpulse.vy,
                            angle: state.puck.angle
                        };
                        arena.startingTime = null;
                    }
                } else if (state.phase === 'FINISHED') {
                    if (state.timer > 10) state.timer = 6; // Set timer first time
                    state.timer--;
                    if (state.timer <= 0) {
                        arena.reset();
                    }
                }

                this.io.to(mode).emit('sync', arena.getSnapshot());
            });
        }, 1000);
    }

    handleConnection(socket) {
        // Default to REAL mode on first connection
        this.setMode(socket, 'REAL');

        socket.on('join_match', (data) => {
            const mode = this.socketRooms.get(socket.id);
            const arena = this.arenas[mode];
            if (arena && arena.state.phase === 'BETTING') {
                arena.addPlayer(socket.id, data.name, data.bet);
                this.io.to(mode).emit('sync', arena.getSnapshot());
            }
        });

        socket.on('disconnect', () => {
            this.socketRooms.delete(socket.id);
        });
    }

    setMode(socket, mode) {
        if (!this.arenas[mode]) return;
        
        const oldMode = this.socketRooms.get(socket.id);
        if (oldMode) socket.leave(oldMode);
        
        socket.join(mode);
        this.socketRooms.set(socket.id, mode);
        
        console.log(`[Manager] Socket ${socket.id} moved to ${mode} arena`);
        // Immediate sync for the new arena
        socket.emit('sync', this.arenas[mode].getSnapshot());
    }
}

module.exports = GameManager;
