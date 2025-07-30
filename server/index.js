const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Correct path: client folder
const clientPath = path.join(__dirname, "../client");
app.use(express.static(clientPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("playAt", ({ timestamp, time }) => {
    socket.broadcast.emit("playAt", { timestamp, time });
  });

  socket.on("pause", () => {
    socket.broadcast.emit("pause");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
