const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { performance } = require("perf_hooks");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));

let adminId = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Assign admin if none exists
  if (!adminId) {
    adminId = socket.id;
    socket.emit("youAreAdmin");
    console.log("👑 Admin assigned to", socket.id);
  }

  socket.on("pingTime", (clientStart) => {
    const serverNow = performance.now();
    socket.emit("pongTime", serverNow, clientStart);
  });

  socket.on("playAt", ({ serverTimestamp, audioTime }) => {
    if (socket.id === adminId) {
      socket.broadcast.emit("playAt", { serverTimestamp, audioTime });
    }
  });

  socket.on("pause", () => {
    if (socket.id === adminId) {
      socket.broadcast.emit("pause");
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === adminId) {
      console.log("👋 Admin left");
      adminId = null;
      // Assign next connected user as admin
      const remainingSockets = Array.from(io.sockets.sockets.keys());
      if (remainingSockets.length > 0) {
        adminId = remainingSockets[0];
        io.to(adminId).emit("youAreAdmin");
        console.log("👑 New admin:", adminId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
