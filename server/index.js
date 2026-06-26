const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Configure Cloudinary
cloudinary.config({
  cloud_name: "dhwjrkntm",
  api_key: "325845527366894",
  api_secret: "FyjJmKDVft6f3XOdoVmH7eqLG2g"
});

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
  transports: ['websocket'],
  compression: false,
  allowEIO3: false
});

// In-memory songs array
let songs = [
  {
    id: 1,
    title: "Lo-Fi Chill Vibes",
    artist: "Ambient Collective",
    duration: "3:45",
    url: "https://file-examples.com/storage/fe96ac13b66ebe89c2b9094/2017/11/file_example_MP3_700KB.mp3",
    type: "external"
  }
];

const songsFile = path.join(__dirname, "songs.json");

// Load saved songs if exists
if (fs.existsSync(songsFile)) {
  try {
    songs = JSON.parse(fs.readFileSync(songsFile, "utf8"));
  } catch (e) {
    console.error("⚠️ Could not load songs.json, using default");
  }
}

// Save songs to file
function saveSongs() {
  fs.writeFileSync(songsFile, JSON.stringify(songs, null, 2));
}

const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));
app.use(express.json());

let adminSocketId = null;
let clients = new Map();
let currentSongId = null;
let isPlaying = false;

// Add song endpoint (for direct Cloudinary uploads from client)
app.post('/add-song', express.json(), (req, res) => {
  const newSong = req.body;
  console.log('🎵 Adding new song from client:', newSong.title);
  
  songs.push(newSong);
  saveSongs();
  io.emit('songsUpdated', songs);
  
  res.json({ success: true, song: newSong });
});

app.get('/api/songs', (req, res) => {
  res.json(songs);
});

app.delete('/api/songs/:id', async (req, res) => {
  const songId = parseInt(req.params.id);
  const songIndex = songs.findIndex(song => song.id === songId);
  
  if (songIndex === -1) {
    return res.status(404).json({ error: 'Song not found' });
  }

  const song = songs[songIndex];
  
  // Delete from Cloudinary if we have a publicId
  if (song.type === 'uploaded' && song.publicId) {
    try {
      await cloudinary.uploader.destroy(song.publicId, { resource_type: "video" });
      console.log(`🗑️ Deleted from Cloudinary: ${song.publicId}`);
    } catch (e) {
      console.error("⚠️ Couldn't delete from Cloudinary:", e);
    }
  }

  songs.splice(songIndex, 1);
  saveSongs();
  console.log(`🗑️ Song deleted: ${song.title}`);
  io.emit('songsUpdated', songs);
  res.json({ success: true, message: 'Song deleted successfully' });
});

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

io.on('connection', (socket) => {
  console.log("🔗 New client connected:", socket.id);
  clients.set(socket.id, {
    id: socket.id,
    isAdmin: false,
    joinedAt: Date.now()
  });
  
  // Handle check admin status
  socket.on('checkAdminStatus', () => {
    socket.emit('adminStatus', { hasAdmin: !!adminSocketId });
  });
  
  // Handle claim admin
  socket.on('claimAdmin', () => {
    if (!adminSocketId) {
      adminSocketId = socket.id;
      clients.get(socket.id).isAdmin = true;
      
      socket.emit('roleAssigned', { isAdmin: true });
      io.emit('adminStatus', { hasAdmin: true });
      
      socket.emit('initialState', {
        isAdmin: true,
        users: Array.from(clients.values()),
        currentSongId,
        isPlaying,
        songs
      });
      
      console.log("👑 Admin claimed by:", socket.id);
    } else {
      socket.emit('roleAssigned', { isAdmin: false });
    }
  });

  socket.emit('initialState', {
    isAdmin: clients.get(socket.id).isAdmin,
    users: Array.from(clients.values()),
    currentSongId,
    isPlaying,
    songs
  });

  // ULTRA LOW LATENCY TIME SYNCHRONIZATION
  socket.on("ultraPingTime", (clientStart) => {
    const serverNow = getHighPrecisionTime();
    socket.emit("ultraPongTime", serverNow, clientStart);
  });

  // ULTRA LOW LATENCY PLAY WITH PERFECT SYNC
  socket.on("ultraPlayAt", ({ serverTimestamp, audioTime }) => {
    if (socket.id === adminSocketId) {
      io.emit("ultraPlayAt", { serverTimestamp, audioTime });
      isPlaying = true;
      console.log(`🚀 PERFECT SYNC PLAY at ${formatTime(audioTime)}`);
    }
  });

  // ULTRA LOW LATENCY PAUSE
  socket.on("ultraPause", ({ audioTime }) => {
    if (socket.id === adminSocketId) {
      io.emit("ultraPause", { audioTime });
      isPlaying = false;
      console.log(`⏸️ PERFECT SYNC PAUSE at ${formatTime(audioTime || 0)}`);
    }
  });

  // Song change handling
  socket.on("songChange", (songData) => {
    if (socket.id === adminSocketId) {
      currentSongId = songData.id;
      socket.broadcast.emit("songChange", songData);
      console.log(`🎵 Song changed to: ${songData.title}`);
    }
  });

  // FORCE TIMELINE SYNC
  socket.on("forceTimelineSync", ({ audioTime }) => {
    if (socket.id === adminSocketId) {
      socket.broadcast.emit("forceTimelineSync", { audioTime, pauseFirst: true });
      console.log(`🎯 FORCE TIMELINE SYNC at ${formatTime(audioTime)}`);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    clients.delete(socket.id);
    
    if (socket.id === adminSocketId) {
      adminSocketId = null;
      console.log("👑 Admin left, admin position vacant");
      io.emit('adminStatus', { hasAdmin: false });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚡ Harmony Sync Server running at http://localhost:${PORT}`);
  console.log(`🎯 Features: Zero-delay sync, Cloudinary uploads, explicit admin claiming`);
});
