const socket = io();
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');

playBtn.onclick = () => {
  socket.emit('play');
  socket.emit('sync', audio.currentTime);
  audio.play();
};

pauseBtn.onclick = () => {
  socket.emit('pause');
  audio.pause();
};

socket.on('play', () => audio.play());
socket.on('pause', () => audio.pause());
socket.on('sync', (time) => { audio.currentTime = time; });
