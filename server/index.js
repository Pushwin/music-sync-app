const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('play', () => socket.broadcast.emit('play'));
    socket.on('pause', () => socket.broadcast.emit('pause'));
    socket.on('sync', (time) => socket.broadcast.emit('sync', time));

    // ✅ Broadcast current time every 2 seconds
    setInterval(() => {
        io.emit('timeUpdate', Date.now());
    }, 2000);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
