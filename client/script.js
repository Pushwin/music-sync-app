const socket = io();
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');

playBtn.onclick = () => {
  socket.emit('play', audio.currentTime);
  audio.play();
};

pauseBtn.onclick = () => {
  socket.emit('pause');
  audio.pause();
};

socket.on('play', (time) => {
  audio.currentTime = time + 0.5; // small adjustment for latency
  audio.play();
});

socket.on('pause', () => audio.pause());
