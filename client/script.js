const socket = io();
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

playBtn.onclick = () => {
  const timestamp = Date.now() + 500;
  socket.emit("playAt", { timestamp, time: audio.currentTime });
  setTimeout(() => audio.play(), 500);
};

pauseBtn.onclick = () => {
  socket.emit("pause");
  audio.pause();
};

socket.on("playAt", ({ timestamp, time }) => {
  const delay = timestamp - Date.now();
  if (Math.abs(audio.currentTime - time) > 0.5) {
    audio.currentTime = time;
  }

  if (delay > 0) {
    setTimeout(() => audio.play(), delay);
  } else {
    audio.play();
  }
});

socket.on("pause", () => {
  audio.pause();
});
