io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('play', (time) => {
        socket.broadcast.emit('play', time);
    });

    socket.on('pause', () => {
        socket.broadcast.emit('pause');
    });
});
