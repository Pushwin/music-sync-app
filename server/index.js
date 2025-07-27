let currentAdmin = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("requestAdmin", () => {
    if (currentAdmin === null) {
      currentAdmin = socket.id;
      socket.emit("adminGranted");
    } else {
      socket.emit("adminDenied");
    }
  });

  socket.on("playAt", ({ timestamp, time }) => {
    if (socket.id === currentAdmin) {
      socket.broadcast.emit("playAt", { timestamp, time });
    }
  });

  socket.on("pause", () => {
    if (socket.id === currentAdmin) {
      socket.broadcast.emit("pause");
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === currentAdmin) {
      currentAdmin = null;
      console.log("Admin left, role cleared");
    }
  });
});
