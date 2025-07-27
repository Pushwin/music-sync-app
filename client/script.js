const socket = io();
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

// Play button
playBtn.onclick = () => {
  const timestamp = Date.now() + 500; // Play after 0.5 sec
  socket.emit("playAt", { timestamp, time: audio.currentTime });
  setTimeout(() => audio.play(), 500);
};

// Pause button
pauseBtn.onclick = () => {
  socket.emit("pause");
  audio.pause();
};

// Sync for listeners
socket.on("playAt", ({ timestamp, time }) => {
  const delay = timestamp - Date.now();

  // Only adjust if drift > 0.5 sec
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
