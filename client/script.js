const socket = io();

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const audio = document.getElementById("audio");
audio.src = "https://media.vocaroo.com/mp3/13vvld8kQ12W";

let isAdmin = false;
let timeOffset = 0;

playBtn.style.display = "none";
pauseBtn.style.display = "none";

// Receive admin rights
socket.on("youAreAdmin", () => {
  isAdmin = true;
  playBtn.style.display = "inline-block";
  pauseBtn.style.display = "inline-block";
});

// Sync clock
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

// Sync play
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

// Play
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

// Pause
pauseBtn.onclick = () => {
  if (!isAdmin) return;
  socket.emit("pause");
  audio.pause();
};

// Listeners
socket.on("playAt", ({ serverTimestamp, audioTime }) => {
  schedulePlayback(serverTimestamp, audioTime);
});

socket.on("pause", () => {
  audio.pause();
});
