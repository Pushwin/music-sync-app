const socket = io();
const audio = document.getElementById("audio");
const adminBtn = document.getElementById("adminBtn");
const adminStatus = document.getElementById("adminStatus");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

let isAdmin = false;

// Try to become admin when button clicked
adminBtn.onclick = () => {
  socket.emit("requestAdmin");
};

// Server response about admin status
socket.on("adminGranted", () => {
  isAdmin = true;
  adminBtn.style.display = "none";
  adminStatus.innerText = "✅ You are Admin";
  document.getElementById("adminControls").style.display = "block";
});

socket.on("adminDenied", () => {
  adminStatus.innerText = "❌ Admin already occupied";
});

// Admin controls
if (isAdmin) {
  playBtn.onclick = () => {
    const timestamp = Date.now() + 500;
    socket.emit("playAt", { timestamp, time: audio.currentTime });
    setTimeout(() => audio.play(), 500);
  };

  pauseBtn.onclick = () => {
    socket.emit("pause");
    audio.pause();
  };
}

// Listeners: sync playback
socket.on("playAt", ({ timestamp, time }) => {
  const delay = timestamp - Date.now();
  if (delay > 0) {
    audio.currentTime = time;
    setTimeout(() => audio.play(), delay);
  }
});

socket.on("pause", () => {
  audio.pause();
});
