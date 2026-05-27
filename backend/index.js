const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const GameManager = require('./src/GameManager');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

console.log('[Main] Bootstrapping Provably Fair Engine...');
const manager = new GameManager(io);

io.on('connection', (socket) => {
    manager.handleConnection(socket);
    
    socket.on('set_mode', (mode) => {
        console.log(`[Socket] Received set_mode request: ${mode}`);
        manager.setMode(socket, mode);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 FAIR CASINO ENGINE RUNNING ON ${PORT}`);
    console.log(`=========================================`);
});
