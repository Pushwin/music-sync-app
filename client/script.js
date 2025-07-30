const socket = io();

const audioUrl = "https://media.vocaroo.com/mp3/13vvld8kQ12W";
let audioBuffer = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let sourceNode = null;
let timeOffset = 0;
let isPaused = true;
let isAdmin = false;
let startAt = 0;

const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");

// Hide buttons by default
playBtn.style.display = "none";
pauseBtn.style.display = "none";

// Ask server if you're admin
socket.emit("join");

socket.on("youAreAdmin", () => {
  isAdmin = true;
  playBtn.style.display = "inline-block";
  pauseBtn.style.display = "inline-block";
});

// Sync clocks
function syncClocks() {
  const start = performance.now();
  socket.emit("pingTime", start);

  socket.once("pongTime", (serverNow, clientStart) => {
    const end = performance.now();
    const rtt = end - clientStart;
    const estimatedServerNow = serverNow + rtt / 2;
    timeOffset = estimatedServerNow - end;
    console.log("⏱ Time offset:", timeOffset.toFixed(2), "ms");
  });
}
syncClocks();
setInterval(syncClocks, 10000);

// Load audio
async function loadAudio() {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  console.log("✅ Audio loaded");
}
loadAudio();

// Schedule play
function schedulePlayback(serverPlayTime, offsetSec = 0) {
  if (sourceNode) sourceNode.stop();

  const when = (serverPlayTime - timeOffset - performance.now()) / 1000;
  startAt = audioContext.currentTime + when;

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  sourceNode.start(startAt, offsetSec);
  isPaused = false;
}

// Admin controls
playBtn.onclick = () => {
  if (!isAdmin) return;
  if (!audioBuffer) return alert("Loading...");
  const localNow = performance.now();
  const serverNow = localNow + timeOffset;
  const playAtServer = serverNow + 2000;

  socket.emit("playAt", { serverTimestamp: playAtServer, offsetTime: 0 });
  schedulePlayback(playAtServer, 0);
};

pauseBtn.onclick = () => {
  if (!isAdmin) return;
  if (sourceNode) sourceNode.stop();
  isPaused = true;
  socket.emit("pause");
};

// Client listeners
socket.on("playAt", ({ serverTimestamp, offsetTime }) => {
  schedulePlayback(serverTimestamp, offsetTime);
});

socket.on("pause", () => {
  if (sourceNode) sourceNode.stop();
  isPaused = true;
});
