const socket = io();
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

let timeOffset = 0;

// Sync clock with server
function syncClocks() {
  const start = performance.now();
  socket.emit("pingTime", start);

  socket.once("pongTime", (serverTime, clientStart) => {
    const end = performance.now();
    const roundTrip = end - clientStart;
    const estimatedServerNow = serverTime + roundTrip / 2;
    timeOffset = estimatedServerNow - end;
    console.log("🕒 Time offset:", timeOffset.toFixed(2), "ms");
  });
}
syncClocks();
setInterval(syncClocks, 10000);

// Accurate play
function playAt(targetTime, expectedAudioTime) {
  function check() {
    const now = performance.now();
    if (Math.abs(audio.currentTime - expectedAudioTime) > 0.03) {
      audio.currentTime = expectedAudioTime;
    }
    if (now >= targetTime - 20) {
      audio.play();
    } else {
      requestAnimationFrame(check);
    }
  }
  check();
}

// Play button
playBtn.onclick = () => {
  const localNow = performance.now();
  const serverNow = localNow + timeOffset;
  const playAtServerTime = serverNow + 2000;

  socket.emit("playAt", {
    serverTimestamp: playAtServerTime,
    audioTime: audio.currentTime
  });

  const localPlayTime = playAtServerTime - timeOffset;
  playAt(localPlayTime, audio.currentTime);
};

// Pause button
pauseBtn.onclick = () => {
  socket.emit("pause");
  audio.pause();
};

// Remote play
socket.on("playAt", ({ serverTimestamp, audioTime }) => {
  const localPlayTime = serverTimestamp - timeOffset;
  playAt(localPlayTime, audioTime);
});

// Remote pause
socket.on("pause", () => {
  audio.pause();
});
