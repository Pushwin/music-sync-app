const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));

let adminId = null;
let currentSong = {
  title: "No song selected",
  artist: "Choose a song to get started",
  url: null
};

// High-precision timing for better synchronization
const getHighPrecisionTime = () => {
  return performance.now() + process.hrtime.bigint() / 1000000n;
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Assign admin if none exists
  if (!adminId) {
    adminId = socket.id;
    socket.emit("youAreAdmin");
    console.log("👑 Admin assigned to", socket.id);
  }

  // Send current song info to new connections
  socket.emit("songChange", currentSong);

  // High-precision time synchronization
  socket.on("pingTime", (clientStart) => {
    const serverNow = performance.now();
    // Respond immediately for better accuracy
    socket.emit("pongTime", serverNow, clientStart);
  });

  // Enhanced play synchronization
  socket.on("playAt", ({ serverTimestamp, audioTime }) => {
    if (socket.id === adminId) {
      console.log(`🎵 Admin playing at ${serverTimestamp}, audioTime: ${audioTime}`);
      
      // Broadcast to all other clients with high precision
      socket.broadcast.emit("playAt", { 
        serverTimestamp: serverTimestamp, 
        audioTime: audioTime 
      });
    }
  });

  // Pause handling
  socket.on("pause", () => {
    if (socket.id === adminId) {
      console.log("⏸️ Admin paused playback");
      socket.broadcast.emit("pause");
    }
  });

  // Song change handling
  socket.on("songChange", (songData) => {
    if (socket.id === adminId) {
      currentSong = {
        title: songData.title || "Unknown Title",
        artist: songData.artist || "Unknown Artist",
        url: songData.url
      };
      
      console.log(`🎵 Song changed to: ${currentSong.title} by ${currentSong.artist}`);
      
      // Broadcast to all other clients
      socket.broadcast.emit("songChange", currentSong);
    }
  });

  // Handle seek/time update for better sync
  socket.on("seekTo", (timeData) => {
    if (socket.id === adminId) {
      console.log(`⏩ Admin seeked to: ${timeData.currentTime}`);
      socket.broadcast.emit("seekTo", timeData);
    }
  });

  // Connection quality monitoring
  socket.on("connectionQuality", (data) => {
    console.log(`📊 Connection quality from ${socket.id}: ${data.latency}ms`);
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    
    if (socket.id === adminId) {
      console.log("👋 Admin left");
      adminId = null;
      
      // Assign next connected user as admin
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        adminId = remainingSockets[0];
        io.to(adminId).emit("youAreAdmin");
        console.log("👑 New admin:", adminId);
        
        // Send current song to new admin
        io.to(adminId).emit("songChange", currentSong);
      }
    }
  });

  // Heartbeat for connection monitoring
  const heartbeat = setInterval(() => {
    if (socket.connected) {
      socket.emit("heartbeat", performance.now());
    } else {
      clearInterval(heartbeat);
    }
  }, 10000);

  socket.on("heartbeatResponse", (serverTime) => {
    const now = performance.now();
    const latency = now - serverTime;
    console.log(`💗 Heartbeat from ${socket.id}: ${latency.toFixed(2)}ms`);
  });
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Harmony Sync Server running at http://localhost:${PORT}`);
  console.log(`🎵 Ready for synchronized music playback!`);
});