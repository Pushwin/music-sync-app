const socket = io();
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');

let lastServerTime = 0;
let lastPing = 0;

// When you press Play
playBtn.onclick = () => {
    socket.emit('play');
    socket.emit('sync', audio.currentTime);
    audio.play();
};

// When you press Pause
pauseBtn.onclick = () => {
    socket.emit('pause');
    audio.pause();
};

// Sync when server tells
socket.on('play', () => audio.play());
socket.on('pause', () => audio.pause());
socket.on('sync', (time) => { audio.currentTime = time; });

// ✅ Drift correction: Server sends time every 2s
socket.on('timeUpdate', (serverTime) => {
    const now = Date.now();
    const latency = (now - serverTime) / 1000; // in seconds
    const expectedTime = audio.currentTime + latency;

    if (Math.abs(audio.currentTime - expectedTime) > 0.2) {
        audio.currentTime = expectedTime; // Adjust drift
    }
});
