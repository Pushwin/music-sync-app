const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const axios = require('axios'); // Add this line

const app = express();
const server = http.createServer(app);

// Ultra-low latency Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,        
  pingInterval: 2000,       
  transports: ['websocket'], // Force WebSocket for lowest latency
  compression: false,       // Disable compression for speed
  allowEIO3: false
});

// MUSIC API INTEGRATION
async function searchSongs(query, limit = 20) {
  try {
    // JioSaavn API (100% FREE - No key needed)
    const response = await axios.get('https://jiosaavn-api-privatecvc.vercel.app/api/search/songs', {
      params: { query, limit },
      timeout: 5000
    });

    if (response.data?.data?.results) {
      return response.data.data.results.map(song => ({
        id: `api_${song.id}`,
        title: song.name || song.title,
        artist: song.primaryArtists || 'Unknown Artist',
        duration: formatTime(song.duration || 0),
        url: song.downloadUrl?.[4]?.link || song.media_preview_url,
        type: 'api',
        source: 'JioSaavn'
      }));
    }
    return [];
  } catch (error) {
    console.error('🎵 Search failed:', error.message);
    return [];
  }
}

// Add search endpoint
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  
  const results = await searchSongs(q);
  res.json({ success: true, results });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());

let adminId = null;
let currentSong = {
  title: "No song selected",
  artist: "Choose a song to get started",
  url: null,
  audioTime: 0 // Track current timeline position
};

// Global sync state
let globalSyncState = {
  isPlaying: false,
  audioTime: 0,
  lastSyncTimestamp: 0
};

// In-memory songs database
let songsDatabase = [
  {
    id: 1,
    title: "Lo-Fi Chill Vibes",
    artist: "Ambient Collective",
    duration: "3:45",
    url: "https://media.vocaroo.com/mp3/13vvld8kQ12W",
    type: "external"
  },
  {
    id: 2,
    title: "Sunset Dreams", 
    artist: "Chillwave Studio",
    duration: "4:12",
    url: "https://media.vocaroo.com/mp3/1n1E0T6Aszur",
    type: "external"
  },
  {
    id: 3,
    title: "Ocean Breeze",
    artist: "Nature Sounds Co",
    duration: "5:30", 
    url: "https://file-examples.com/storage/fe96ac13b66ebe89c2b9094/2017/11/file_example_MP3_700KB.mp3",
    type: "external"
  }
];

// Performance tracking
let performanceMetrics = {
  totalPlays: 0,
  totalSyncs: 0,
  avgProcessingTime: 0,
  processingTimes: []
};

const trackProcessingTime = (startTime, operation) => {
  const processingTime = performance.now() - startTime;
  performanceMetrics.processingTimes.push(processingTime);
  
  if (performanceMetrics.processingTimes.length > 100) {
    performanceMetrics.processingTimes.shift();
  }
  
  performanceMetrics.avgProcessingTime = 
    performanceMetrics.processingTimes.reduce((a, b) => a + b) / 
    performanceMetrics.processingTimes.length;
    
  if (processingTime > 0.5) {
    console.log(`⚡ ${operation} processed in ${processingTime.toFixed(3)}ms (avg: ${performanceMetrics.avgProcessingTime.toFixed(3)}ms)`);
  }
};

// High precision timing
const getHighPrecisionTime = () => {
  return performance.now() + (performance.timeOrigin % 1000000);
};

// Format time helper
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// File upload endpoint
app.post('/upload-song', upload.single('songFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, artist } = req.body;
    
    const newSong = {
      id: Date.now(),
      title: title || path.parse(req.file.originalname).name,
      artist: artist || "Unknown Artist",
      duration: "Unknown",
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      type: "uploaded",
      uploadedAt: new Date().toISOString()
    };

    songsDatabase.push(newSong);
    console.log(`🎵 New song uploaded: ${newSong.title} by ${newSong.artist}`);

    io.emit('songsUpdated', songsDatabase);
    res.json({ success: true, song: newSong, message: 'Song uploaded successfully!' });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/songs', (req, res) => {
  res.json(songsDatabase);
});

app.delete('/api/songs/:id', (req, res) => {
  const songId = parseInt(req.params.id);
  const songIndex = songsDatabase.findIndex(song => song.id === songId);
  
  if (songIndex === -1) {
    return res.status(404).json({ error: 'Song not found' });
  }

  const song = songsDatabase[songIndex];
  
  if (song.type === 'uploaded' && song.filename) {
    const filePath = path.join(uploadsDir, song.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${song.filename}`);
    }
  }

  songsDatabase.splice(songIndex, 1);
  console.log(`🗑️ Song deleted: ${song.title}`);
  io.emit('songsUpdated', songsDatabase);
  res.json({ success: true, message: 'Song deleted successfully' });
});

// TCP optimization for low latency
server.on('connection', (socket) => {
  socket.setNoDelay(true);
  socket.setTimeout(5000);
});

io.on("connection", (socket) => {
  const connectTime = performance.now();
  console.log("User connected:", socket.id);

  // Send current state to new connection
  socket.emit("songsUpdated", songsDatabase);
  socket.emit("songChange", currentSong);

  // Assign admin if none exists
  if (!adminId) {
    adminId = socket.id;
    socket.emit("youAreAdmin");
    console.log("👑 Admin assigned to", socket.id);
  } else {
    socket.emit("youAreNotAdmin");
    console.log("👤 Regular user connected:", socket.id);
  }

  // Send current connected user count to all clients
  const userCount = io.sockets.sockets.size;
  io.emit("userCount", userCount);

  // ULTRA LOW LATENCY TIME SYNCHRONIZATION
  socket.on("ultraPingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = getHighPrecisionTime();
    socket.emit("ultraPongTime", serverNow, clientStart);
    trackProcessingTime(startProcess, "Ultra time sync");
  });

  // LEGACY TIME SYNCHRONIZATION
  socket.on("pingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = performance.now();
    socket.emit("pongTime", serverNow, clientStart);
    trackProcessingTime(startProcess, "Legacy time sync");
  });

  // FORCE TIMELINE SYNC - This is the key feature!
  socket.on("forceTimelineSync", ({ audioTime, pauseFirst }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      performanceMetrics.totalSyncs++;
      
      console.log(`🎯 FORCE TIMELINE SYNC from admin: ${formatTime(audioTime)}`);
      
      // Update global sync state
      globalSyncState.audioTime = audioTime;
      globalSyncState.isPlaying = false; // Force pause during sync
      globalSyncState.lastSyncTimestamp = getHighPrecisionTime();
      
      // Update current song position
      currentSong.audioTime = audioTime;
      
      // Broadcast to ALL other clients (not admin)
      socket.broadcast.emit("forceTimelineSync", {
        audioTime: audioTime,
        pauseFirst: pauseFirst || true
      });
      
      console.log(`✅ Timeline sync broadcasted to ${io.sockets.sockets.size - 1} devices`);
      trackProcessingTime(startProcess, "Force timeline sync");
    }
  });

  // ULTRA LOW LATENCY PLAY WITH PERFECT SYNC
  socket.on("ultraPlayAt", ({ serverTimestamp, audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      performanceMetrics.totalPlays++;
      
      // Update global state
      globalSyncState.isPlaying = true;
      globalSyncState.audioTime = audioTime;
      globalSyncState.lastSyncTimestamp = serverTimestamp;
      
      console.log(`🚀 PERFECT SYNC PLAY from admin at ${formatTime(audioTime)}`);
      
      // Broadcast immediately to all other clients
      socket.broadcast.emit("ultraPlayAt", { 
        serverTimestamp: serverTimestamp, 
        audioTime: audioTime 
      });
      
      trackProcessingTime(startProcess, "Ultra sync play");
    }
  });

  // ULTRA LOW LATENCY PAUSE WITH POSITION SYNC
  socket.on("ultraPause", ({ audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      // Update global state
      globalSyncState.isPlaying = false;
      if (audioTime !== undefined) {
        globalSyncState.audioTime = audioTime;
        currentSong.audioTime = audioTime;
      }
      
      console.log(`⏸️ PERFECT SYNC PAUSE at ${formatTime(audioTime || 0)}`);
      
      // Broadcast with position info
      socket.broadcast.emit("ultraPause", { 
        audioTime: audioTime 
      });
      
      trackProcessingTime(startProcess, "Ultra sync pause");
    }
  });

  // LEGACY PLAY SYNCHRONIZATION
  socket.on("playAt", ({ serverTimestamp, audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log(`🎵 Legacy play at ${formatTime(audioTime)}`);
      socket.broadcast.emit("playAt", { serverTimestamp, audioTime });
      trackProcessingTime(startProcess, "Legacy play");
    }
  });

  // LEGACY PAUSE
  socket.on("pause", () => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log("⏸️ Legacy pause");
      socket.broadcast.emit("pause");
      trackProcessingTime(startProcess, "Legacy pause");
    }
  });

  // Song change handling with timeline sync
  socket.on("songChange", (songData) => {
    if (socket.id === adminId) {
      currentSong = {
        title: songData.title || "Unknown Title",
        artist: songData.artist || "Unknown Artist", 
        url: songData.url,
        audioTime: songData.audioTime || 0
      };
      
      // Reset global sync state for new song
      globalSyncState = {
        isPlaying: false,
        audioTime: 0,
        lastSyncTimestamp: getHighPrecisionTime()
      };
      
      console.log(`🎵 Song changed to: ${currentSong.title} by ${currentSong.artist}`);
      socket.broadcast.emit("songChange", currentSong);
    }
  });

  // Connection quality monitoring
  socket.on("qualityReport", (data) => {
    console.log(`📊 Quality report from ${socket.id}:`, data);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const sessionTime = performance.now() - connectTime;
    console.log(`User disconnected: ${socket.id} (session: ${sessionTime.toFixed(1)}ms)`);
    
    if (socket.id === adminId) {
      console.log("👋 Admin left, transferring control...");
      adminId = null;
      
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        adminId = remainingSockets[0];
        io.to(adminId).emit("youAreAdmin");
        
        // Send current sync state to new admin
        io.to(adminId).emit("songChange", currentSong);
        io.to(adminId).emit("syncStateUpdate", globalSyncState);
        
        console.log("👑 New admin:", adminId);
      }
    }
    
    // Update user count
    const userCount = io.sockets.sockets.size;
    io.emit("userCount", userCount);
  });

  console.log(`✅ Client ${socket.id} ready in ${(performance.now() - connectTime).toFixed(2)}ms`);
});

// Performance and sync monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const connectedClients = io.sockets.sockets.size;
  
  if (connectedClients > 0) {
    console.log(`📊 Performance: ${connectedClients} clients | Plays: ${performanceMetrics.totalPlays} | Syncs: ${performanceMetrics.totalSyncs} | Avg: ${performanceMetrics.avgProcessingTime.toFixed(2)}ms | Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    
    // Send sync statistics to all clients
    io.emit("syncStats", {
      connectedUsers: connectedClients,
      totalSyncs: performanceMetrics.totalSyncs,
      avgLatency: performanceMetrics.avgProcessingTime,
      globalState: globalSyncState
    });
  }
  
  // Optimize garbage collection
  if (global.gc && memUsage.heapUsed > 100 * 1024 * 1024) {
    const gcStart = performance.now();
    global.gc();
    console.log(`🗑️ GC completed in ${(performance.now() - gcStart).toFixed(2)}ms`);
  }
}, 5000);

// Cleanup on server shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down gracefully...');
  
  // Notify all clients
  io.emit("serverShutdown", "Server is shutting down");
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', promise, 'reason:', reason);
});

// Optimize HTTP server for ultra-low latency
server.timeout = 5000;
server.keepAliveTimeout = 1000;
server.headersTimeout = 1100;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ ZERO-DELAY Harmony Sync Server running at http://localhost:${PORT}`);
  console.log(`🎯 PERFECT TIMELINE SYNCHRONIZATION enabled!`);
  console.log(`🎵 Features:`);
  console.log(`   • Zero-delay playback sync`);
  console.log(`   • Perfect timeline position sync`);
  console.log(`   • Force sync any timeline position`);
  console.log(`   • Music search API integration`);
  console.log(`   • WebSocket-only, TCP_NODELAY enabled`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log(`\n💡 Optimization: Run with 'node --expose-gc --max-old-space-size=512 index.js'`);
  console.log(`🎮 Admin Controls:`);
  console.log(`   • Search songs from JioSaavn`);
  console.log(`   • Drag timeline → Force Sync = Perfect position sync`);
  console.log(`   • Play = All devices start simultaneously`);
  console.log(`   • Pause = All devices pause at exact same position`);

});
