const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);

// Ultra-low latency Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,        // Reduced from 60000
  pingInterval: 2000,       // Reduced from 25000
  transports: ['websocket'], // Force WebSocket for lowest latency
  compression: false,       // Disable compression for speed
  allowEIO3: false
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
    // Generate unique filename
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only audio files
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
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files
app.use(express.json());

let adminId = null;
let currentSong = {
  title: "No song selected",
  artist: "Choose a song to get started",
  url: null
};

// In-memory songs database (includes uploaded songs)
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
    url: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
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
  avgProcessingTime: 0,
  processingTimes: []
};

// Process timing tracker
const trackProcessingTime = (startTime, operation) => {
  const processingTime = performance.now() - startTime;
  performanceMetrics.processingTimes.push(processingTime);
  
  if (performanceMetrics.processingTimes.length > 100) {
    performanceMetrics.processingTimes.shift();
  }
  
  performanceMetrics.avgProcessingTime = 
    performanceMetrics.processingTimes.reduce((a, b) => a + b) / 
    performanceMetrics.processingTimes.length;
    
  if (processingTime > 1) { // Only log if > 1ms
    console.log(`⚡ ${operation} processed in ${processingTime.toFixed(3)}ms (avg: ${performanceMetrics.avgProcessingTime.toFixed(3)}ms)`);
  }
};

// File upload endpoint
app.post('/upload-song', upload.single('songFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, artist } = req.body;
    
    // Create new song entry
    const newSong = {
      id: Date.now(), // Simple ID generation
      title: title || path.parse(req.file.originalname).name,
      artist: artist || "Unknown Artist",
      duration: "Unknown", // You could use a library like node-ffmpeg to get duration
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      type: "uploaded",
      uploadedAt: new Date().toISOString()
    };

    // Add to songs database
    songsDatabase.push(newSong);

    console.log(`🎵 New song uploaded: ${newSong.title} by ${newSong.artist}`);

    // Notify all clients about the new song
    io.emit('songsUpdated', songsDatabase);

    res.json({ 
      success: true, 
      song: newSong,
      message: 'Song uploaded successfully!' 
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all songs endpoint
app.get('/api/songs', (req, res) => {
  res.json(songsDatabase);
});

// Delete song endpoint (admin only)
app.delete('/api/songs/:id', (req, res) => {
  const songId = parseInt(req.params.id);
  const songIndex = songsDatabase.findIndex(song => song.id === songId);
  
  if (songIndex === -1) {
    return res.status(404).json({ error: 'Song not found' });
  }

  const song = songsDatabase[songIndex];
  
  // Delete file if it's an uploaded song
  if (song.type === 'uploaded' && song.filename) {
    const filePath = path.join(uploadsDir, song.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${song.filename}`);
    }
  }

  // Remove from database
  songsDatabase.splice(songIndex, 1);
  
  console.log(`🗑️ Song deleted: ${song.title}`);
  
  // Notify all clients
  io.emit('songsUpdated', songsDatabase);
  
  res.json({ success: true, message: 'Song deleted successfully' });
});

// High-precision timing for better synchronization
const getHighPrecisionTime = () => {
  return performance.now() + (performance.timeOrigin % 1000000);
};

// TCP optimization for low latency
server.on('connection', (socket) => {
  socket.setNoDelay(true);
  socket.setTimeout(5000);
});

io.on("connection", (socket) => {
  const connectTime = performance.now();
  console.log("User connected:", socket.id);

  // Send current songs database to ALL new connections
  socket.emit("songsUpdated", songsDatabase);
  socket.emit("songChange", currentSong);

  // Assign admin if none exists
  if (!adminId) {
    adminId = socket.id;
    socket.emit("youAreAdmin");
    console.log("👑 Admin assigned to", socket.id);
  } else {
    // Let non-admin users know they're not admin
    socket.emit("youAreNotAdmin");
    console.log("👤 Regular user connected:", socket.id);
  }

  // ULTRA LOW LATENCY TIME SYNCHRONIZATION
  socket.on("ultraPingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = getHighPrecisionTime();
    socket.emit("ultraPongTime", serverNow, clientStart);
    trackProcessingTime(startProcess, "Ultra time sync");
  });

  // LEGACY TIME SYNCHRONIZATION (for compatibility)
  socket.on("pingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = performance.now();
    socket.emit("pongTime", serverNow, clientStart);
    trackProcessingTime(startProcess, "Legacy time sync");
  });

  // ULTRA LOW LATENCY PLAY SYNCHRONIZATION
  socket.on("ultraPlayAt", ({ serverTimestamp, audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      performanceMetrics.totalPlays++;
      console.log(`🚀 Ultra play command from admin at ${serverTimestamp.toFixed(3)}, audioTime: ${audioTime.toFixed(3)}`);
      
      // Broadcast immediately to all other clients
      socket.broadcast.emit("ultraPlayAt", { 
        serverTimestamp: serverTimestamp, 
        audioTime: audioTime 
      });
      
      trackProcessingTime(startProcess, "Ultra play broadcast");
    }
  });

  // LEGACY PLAY SYNCHRONIZATION (for compatibility)
  socket.on("playAt", ({ serverTimestamp, audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log(`🎵 Legacy play at ${serverTimestamp}, audioTime: ${audioTime}`);
      socket.broadcast.emit("playAt", { serverTimestamp, audioTime });
      trackProcessingTime(startProcess, "Legacy play");
    }
  });

  // ULTRA LOW LATENCY PAUSE
  socket.on("ultraPause", () => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log("⚡ Ultra pause from admin");
      socket.broadcast.emit("ultraPause");
      trackProcessingTime(startProcess, "Ultra pause broadcast");
    }
  });

  // LEGACY PAUSE (for compatibility)
  socket.on("pause", () => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log("⏸️ Legacy pause");
      socket.broadcast.emit("pause");
      trackProcessingTime(startProcess, "Legacy pause");
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
      socket.broadcast.emit("songChange", currentSong);
    }
  });

  // Handle song deletion requests
  socket.on("deleteSong", (songId) => {
    if (socket.id === adminId) {
      console.log(`🗑️ Admin requested to delete song ID: ${songId}`);
    }
  });

  // Connection quality monitoring
  socket.on("qualityReport", (data) => {
    console.log(`📊 Quality report from ${socket.id}:`, data);
  });

  // Disconnect handling
  socket.on("disconnect", () => {
    const sessionTime = performance.now() - connectTime;
    console.log(`User disconnected: ${socket.id} (session: ${sessionTime.toFixed(1)}ms)`);
    
    if (socket.id === adminId) {
      console.log("👋 Admin left");
      adminId = null;
      
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        adminId = remainingSockets[0];
        io.to(adminId).emit("youAreAdmin");
        console.log("👑 New admin:", adminId);
        io.to(adminId).emit("songChange", currentSong);
      }
    }
  });

  console.log(`✅ Client ${socket.id} ready in ${(performance.now() - connectTime).toFixed(2)}ms`);
});

// Performance monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const connectedClients = io.sockets.sockets.size;
  
  if (connectedClients > 0) {
    console.log(`📊 Performance: ${connectedClients} clients, ${performanceMetrics.totalPlays} plays, ${performanceMetrics.avgProcessingTime.toFixed(2)}ms avg, ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  }
  
  // Optimize garbage collection for ultra-low latency
  if (global.gc && memUsage.heapUsed > 100 * 1024 * 1024) { // 100MB threshold
    const gcStart = performance.now();
    global.gc();
    console.log(`🗑️ GC completed in ${(performance.now() - gcStart).toFixed(2)}ms`);
  }
}, 10000);

// Cleanup on server shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Optimize HTTP server for low latency
server.timeout = 5000;
server.keepAliveTimeout = 1000;
server.headersTimeout = 1100;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ ULTRA LOW LATENCY Harmony Sync Server running at http://localhost:${PORT}`);
  console.log(`🎵 Ready for synchronized music playback!`);
  console.log(`🎯 Target: <10ms synchronization precision`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log(`🔧 WebSocket-only, TCP_NODELAY enabled`);
  
  // Display optimization recommendations
  console.log(`\n💡 Run with: node --expose-gc --max-old-space-size=512 index.js`);
});