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

// 🔥 in-memory storage
let messages = [];
let nextId = 1;

io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.id);

  // send history once
  socket.on("join", () => {
    socket.emit("history", messages);
  });

  // send message
  socket.on("send", ({ user, text }) => {
    console.log("MESSAGE:", user, text);

    const msg = {
      id: nextId++,
      user,
      text,
    };

    messages.push(msg);

    io.emit("message", msg);
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.id);
  });
});

// 🔥 network accessible
server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on 0.0.0.0:3000");
});