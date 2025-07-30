const socket = io();
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

let timeOffset = 0;

// Clock sync
function syncClocks() {
  const start = performance.now();
  socket.emit("pingTime");

  socket.once("pongTime", (serverTime) => {
    const end = performance.now();
    const roundTrip = end - start;
    const estimatedServerTime = serverTime + roundTrip / 2;
    timeOffset = estimatedServerTime - end;
    console.log("🕒 Time offset synced:", timeOffset.toFixed(2), "ms");
  });
}
setInterval(syncClocks, 10000);
syncClocks();

// Play button
playBtn.onclick = () => {
  const localNow = performance.now();
  const serverNow = localNow + timeOffset;
  const playAtServerTime = serverNow + 2000;

  socket.emit("playAt", {
    serverTimestamp: playAtServerTime,
    audioTime: audio.currentTime,
  });

  const localPlayTime = playAtServerTime - timeOffset;
  const delay = localPlayTime - performance.now();
  if (delay > 0) {
    setTimeout(() => audio.play(), delay);
  } else {
    audio.play();
  }
};

// Pause button
pauseBtn.onclick = () => {
  socket.emit("pause");
  audio.pause();
};

// Play on other devices
socket.on("playAt", ({ serverTimestamp, audioTime }) => {
  const localPlayTime = serverTimestamp - timeOffset;
  const delay = localPlayTime - performance.now();

  if (Math.abs(audio.currentTime - audioTime) > 0.2) {
    audio.currentTime = audioTime;
  }

  if (delay > 0) {
    setTimeout(() => audio.play(), delay);
  } else {
    audio.play();
  }
});

// Pause sync
socket.on("pause", () => {
  audio.pause();
});
