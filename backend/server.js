const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" },
});

// DB
const db = new sqlite3.Database("./chat.db");

db.run("CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)");
db.run("CREATE TABLE IF NOT EXISTS messages (roomId TEXT, sender TEXT, data TEXT, iv TEXT)");

// AUTH
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users VALUES (?,?)", [username, password], (err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username=? AND password=?", [username, password], (err, row) => {
    if (row) res.json({ success: true, username });
    else res.json({ success: false });
  });
});

// SOCKET
io.on("connection", (socket) => {

  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
  });

  socket.on("sendMessage", (msg) => {
    io.to(msg.roomId).emit("messages", [msg]);
  });

  // CALL SIGNALING
  socket.on("call-offer", (offer) => socket.broadcast.emit("call-offer", offer));
  socket.on("call-answer", (answer) => socket.broadcast.emit("call-answer", answer));
  socket.on("call-candidate", (c) => socket.broadcast.emit("call-candidate", c));
});

server.listen(3000, () => console.log("Server running"));