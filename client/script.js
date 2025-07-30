const socket = io();

const audioUrl = "https://media.vocaroo.com/mp3/13vvld8kQ12W"; // Your song
let audioBuffer = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let sourceNode = null;
let timeOffset = 0; // server - client time difference
let isPaused = true;
let startAt = 0;

// Sync client clock with server
function syncClocks() {
  const start = performance.now();
  socket.emit("pingTime", start);

  socket.once("pongTime", (serverNow, clientStart) => {
    const end = performance.now();
    const rtt = end - clientStart;
    const estimatedServerNow = serverNow + rtt / 2;
    timeOffset = estimatedServerNow - end;
    console.log("⏱ Time offset synced:", timeOffset.toFixed(2), "ms");
  });
}
syncClocks();
setInterval(syncClocks, 10000);

// Load and decode audio
async function loadAudio() {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  console.log("✅ Audio loaded");
}
loadAudio();

// Schedule precise playback
function schedulePlayback(serverPlayTime, offsetSec = 0) {
  if (sourceNode) sourceNode.stop();

  const when = (serverPlayTime - timeOffset - performance.now()) / 1000;
  startAt = audioContext.currentTime + when;

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  sourceNode.start(startAt, offsetSec);
  isPaused = false;
  console.log("🎵 Scheduled playback at", startAt.toFixed(3), "with offset", offsetSec.toFixed(2));
}

// Buttons
document.getElementById("playBtn").onclick = () => {
  if (!audioBuffer) return alert("Still loading audio...");
  const localNow = performance.now();
  const serverNow = localNow + timeOffset;
  const playAtServer = serverNow + 2000; // 2s delay for sync
  const offsetTime = 0;

  socket.emit("playAt", { serverTimestamp: playAtServer, offsetTime });
  schedulePlayback(playAtServer, offsetTime);
};

document.getElementById("pauseBtn").onclick = () => {
  if (sourceNode) sourceNode.stop();
  isPaused = true;
  socket.emit("pause");
};

// Listeners
socket.on("playAt", ({ serverTimestamp, offsetTime }) => {
  schedulePlayback(serverTimestamp, offsetTime);
});

socket.on("pause", () => {
  if (sourceNode) sourceNode.stop();
  isPaused = true;
});
