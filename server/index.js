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

  socket.on("join", () => {
    if (!adminId) {
      adminId = socket.id;
      socket.emit("youAreAdmin");
      console.log("👑 Assigned admin:", socket.id);
    }
  });

  socket.on("pingTime", (clientStart) => {
    const serverNow = performance.now();
    socket.emit("pongTime", serverNow, clientStart);
  });

  socket.on("playAt", ({ serverTimestamp, offsetTime }) => {
    if (socket.id === adminId) {
      socket.broadcast.emit("playAt", { serverTimestamp, offsetTime });
    }
  });

  socket.on("pause", () => {
    if (socket.id === adminId) {
      socket.broadcast.emit("pause");
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === adminId) {
      console.log("👋 Admin disconnected");
      adminId = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
