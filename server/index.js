const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Ultra-low latency Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000,        // Reduced for faster disconnect detection
  pingInterval: 2000,       // More frequent pings
  transports: ['websocket'], // Force WebSocket for lowest latency
  upgrade: false,           // Disable polling fallback
  allowEIO3: false,         // Use only Engine.IO v4
  maxHttpBufferSize: 1e6,   // 1MB buffer
  compression: false,       // Disable compression for speed
  httpCompression: false    // Disable HTTP compression
});

const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));

let adminId = null;
let performanceMetrics = {
  totalPlays: 0,
  avgProcessingTime: 0,
  processingTimes: []
};

// High-precision timing
const getHighPrecisionTime = () => {
  return performance.now() + (performance.timeOrigin % 1000000);
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
    
  console.log(`⚡ ${operation} processed in ${processingTime.toFixed(3)}ms (avg: ${performanceMetrics.avgProcessingTime.toFixed(3)}ms)`);
};

io.on("connection", (socket) => {
  const connectTime = performance.now();
  console.log(`🔗 Ultra-fast connection: ${socket.id}`);

  // Assign admin with minimal delay
  if (!adminId) {
    adminId = socket.id;
    socket.emit("youAreAdmin");
    console.log(`👑 Admin assigned instantly: ${socket.id}`);
  } else {
    socket.emit("youAreNotAdmin");
  }

  // Ultra-precise time synchronization
  socket.on("ultraPingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = getHighPrecisionTime();
    
    // Immediate response - no processing delays
    socket.emit("ultraPongTime", serverNow, clientStart);
    
    trackProcessingTime(startProcess, "Time sync");
  });

  // Ultra-low latency play synchronization
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

  // Ultra-fast pause handling
  socket.on("ultraPause", () => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log("⚡ Ultra pause from admin");
      socket.broadcast.emit("ultraPause");
      trackProcessingTime(startProcess, "Ultra pause broadcast");
    }
  });

  // Legacy support for existing play/pause commands
  socket.on("playAt", ({ serverTimestamp, audioTime }) => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log(`🎵 Legacy play at ${serverTimestamp}, audioTime: ${audioTime}`);
      socket.broadcast.emit("playAt", { serverTimestamp, audioTime });
      trackProcessingTime(startProcess, "Legacy play");
    }
  });

  socket.on("pause", () => {
    const startProcess = performance.now();
    
    if (socket.id === adminId) {
      console.log("⏸️ Legacy pause");
      socket.broadcast.emit("pause");
      trackProcessingTime(startProcess, "Legacy pause");
    }
  });

  // Legacy time sync support
  socket.on("pingTime", (clientStart) => {
    const startProcess = performance.now();
    const serverNow = performance.now();
    socket.emit("pongTime", serverNow, clientStart);
    trackProcessingTime(startProcess, "Legacy time sync");
  });

  // Handle disconnections with minimal latency
  socket.on("disconnect", () => {
    const disconnectTime = performance.now();
    console.log(`❌ Ultra-fast disconnect: ${socket.id} (session: ${(disconnectTime - connectTime).toFixed(1)}ms)`);
    
    if (socket.id === adminId) {
      console.log("👋 Admin disconnected - finding new admin");
      adminId = null;
      
      // Immediately assign new admin
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        adminId = remainingSockets[0];
        io.to(adminId).emit("youAreAdmin");
        console.log(`👑 New admin assigned instantly: ${adminId}`);
      }
    }
  });

  // Connection quality monitoring
  socket.on("qualityReport", (data) => {
    console.log(`📊 Quality report from ${socket.id}:`, data);
  });

  console.log(`✅ Client ${socket.id} connected in ${(performance.now() - connectTime).toFixed(2)}ms`);
});

// Performance monitoring and optimization
setInterval(() => {
  const memUsage = process.memoryUsage();
  const connectedClients = io.sockets.sockets.size;
  
  console.log(`📊 Performance Stats:`);
  console.log(`   Connected: ${connectedClients} clients`);
  console.log(`   Total plays: ${performanceMetrics.totalPlays}`);
  console.log(`   Avg processing: ${performanceMetrics.avgProcessingTime.toFixed(3)}ms`);
  console.log(`   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  
  // Optimize garbage collection for ultra-low latency
  if (global.gc && memUsage.heapUsed > 100 * 1024 * 1024) { // 100MB threshold
    const gcStart = performance.now();
    global.gc();
    console.log(`🗑️ GC completed in ${(performance.now() - gcStart).toFixed(2)}ms`);
  }
}, 10000);

// Optimize Node.js for ultra-low latency
process.on('warning', (warning) => {
  console.warn('⚠️ Node.js warning:', warning.name, warning.message);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  // Don't exit in production - log and continue for maximum uptime
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Optimize HTTP server for low latency
server.timeout = 5000;        // 5 second timeout
server.keepAliveTimeout = 1000; // 1 second keep-alive
server.headersTimeout = 1100;  // Slightly higher than keep-alive

// Enable TCP_NODELAY for immediate packet sending
server.on('connection', (socket) => {
  socket.setNoDelay(true);
  socket.setTimeout(5000);
});

// Graceful shutdown with connection cleanup
const gracefulShutdown = () => {
  console.log('🛑 Graceful shutdown initiated...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    io.close(() => {
      console.log('✅ Socket.IO closed');
      process.exit(0);
    });
  });
  
  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.log('⚠️ Force exit after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server with ultra-low latency optimizations
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`⚡ ULTRA LOW LATENCY Harmony Sync Server`);
  console.log(`🚀 Running at http://localhost:${PORT}`);
  console.log(`🎯 Target: <10ms synchronization precision`);
  console.log(`⚡ WebSocket-only, compression disabled`);
  console.log(`🔧 TCP_NODELAY enabled, optimized timeouts`);
  
  // Display optimization recommendations
  console.log(`\n🔧 OPTIMIZATION RECOMMENDATIONS:`);
  console.log(`   - Run with --expose-gc for garbage collection control`);
  console.log(`   - Use --max-old-space-size=512 to limit memory`);
  console.log(`   - Consider --unhandled-rejections=warn for production`);
  console.log(`   - Example: node --expose-gc --max-old-space-size=512 index.js`);
});