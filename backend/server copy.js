const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" },
});

// 🔥 IN-MEMORY STORE (no DB = no bugs)
let messages = [];
let nextId = 1;

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("join", () => {
    // 🔥 send history ONCE
    socket.emit("history", messages);
  });

  socket.on("send", (text) => {
    const msg = {
      id: nextId++,
      text,
    };

    messages.push(msg);

    // 🔥 send ONLY new message
    io.emit("message", msg);
  });
});

server.listen(3000, () => console.log("server running"));