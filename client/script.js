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

// Accurate playback function
function playAtPreciseTime(targetTime, expectedAudioTime) {
  function loop() {
    const now = performance.now();
    if (Math.abs(audio.currentTime - expectedAudioTime) > 0.05) {
      audio.currentTime = expectedAudioTime;
    }
    if (now >= targetTime - 30) { // 30ms early buffer
      audio.play();
    } else {
      requestAnimationFrame(loop);
    }
  }
  loop();
}

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
  playAtPreciseTime(localPlayTime, audio.currentTime);
};

// Pause button
pauseBtn.onclick = () => {
  socket.emit("pause");
  audio.pause();
};

// Play on other devices
socket.on("playAt", ({ serverTimestamp, audioTime }) => {
  const localPlayTime = serverTimestamp - timeOffset;
  playAtPreciseTime(localPlayTime, audioTime);
});

// Pause sync
socket.on("pause", () => {
  audio.pause();
});
