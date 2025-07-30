const socket = io();

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const audio = document.getElementById("audio");
const volumeSlider = document.getElementById("volumeSlider");

audio.src = "https://media.vocaroo.com/mp3/13vvld8kQ12W";
audio.volume = volumeSlider.value;

let isAdmin = false;
let timeOffset = 0;

// Hide buttons until admin is confirmed
playBtn.style.display = "none";
pauseBtn.style.display = "none";

// 🔊 Volume control
volumeSlider.oninput = (e) => {
  audio.volume = e.target.value;
};

// 👑 Admin setup
socket.on("youAreAdmin", () => {
  isAdmin = true;
  playBtn.style.display = "inline-block";
  pauseBtn.style.display = "inline-block";
});

// 🕒 Sync clocks
function syncClocks() {
  const start = performance.now();
  socket.emit("pingTime", start);

  socket.once("pongTime", (serverNow, clientStart) => {
    const end = performance.now();
    const rtt = end - clientStart;
    const estimatedServerNow = serverNow + rtt / 2;
    timeOffset = estimatedServerNow - end;
  });
}
syncClocks();
setInterval(syncClocks, 10000);

// 🎶 Play scheduling
function schedulePlayback(serverTime, audioTime = 0) {
  const localPlayTime = serverTime - timeOffset;
  const delay = localPlayTime - performance.now();

  if (Math.abs(audio.currentTime - audioTime) > 0.05) {
    audio.currentTime = audioTime;
  }

  if (delay > 0) {
    setTimeout(() => audio.play(), delay);
  } else {
    audio.play();
  }
}

// ▶️ Play button
playBtn.onclick = () => {
  if (!isAdmin) return;
  const localNow = performance.now();
  const serverNow = localNow + timeOffset;
  const playAtServer = serverNow + 2000;

  socket.emit("playAt", {
    serverTimestamp: playAtServer,
    audioTime: audio.currentTime,
  });

  schedulePlayback(playAtServer, audio.currentTime);
};

// ⏸ Pause button
pauseBtn.onclick = () => {
  if (!isAdmin) return;
  socket.emit("pause");
  audio.pause();
};

// ⏯ Listen to events
socket.on("playAt", ({ serverTimestamp, audioTime }) => {
  schedulePlayback(serverTimestamp, audioTime);
});

socket.on("pause", () => {
  audio.pause();
});
