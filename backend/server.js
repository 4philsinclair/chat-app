const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// 🌍 FRONTEND URL (your Vercel app)
const FRONTEND_URL = "https://chat-app-gold-pi-fu04bo673n.vercel.app";

// 🔌 SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
  },
});

// 🧱 MIDDLEWARE
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// 💾 DATABASE
const db = new sqlite3.Database("./chat.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId TEXT,
      sender TEXT,
      data TEXT,
      iv TEXT
    )
  `);
});

// =====================
// 🔐 AUTH ROUTES
// =====================

// REGISTER
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) {
        return res.json({ success: false, error: "User exists" });
      }
      res.json({ success: true });
    }
  );
});

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (row) {
        res.json({ success: true, username });
      } else {
        res.json({ success: false, error: "Invalid credentials" });
      }
    }
  );
});

// =====================
// 💬 SOCKET LOGIC
// =====================

const rooms = {};
const publicKeys = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 🔑 JOIN ROOM
  socket.on("joinRoom", ({ roomId, userId, publicKey }) => {
    socket.join(roomId);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);

    if (!publicKeys[roomId]) publicKeys[roomId] = {};
    publicKeys[roomId][userId] = publicKey;

    console.log(userId, "joined", roomId);

    // send all public keys
    io.to(roomId).emit("publicKeys", publicKeys[roomId]);

    // send previous messages
    db.all(
      "SELECT * FROM messages WHERE roomId = ?",
      [roomId],
      (err, rows) => {
        const msgs = rows.map((r) => ({
          sender: r.sender,
          data: JSON.parse(r.data),
          iv: JSON.parse(r.iv),
        }));

        socket.emit("messages", msgs);
      }
    );
  });

  // 📤 SEND MESSAGE
  socket.on("sendMessage", ({ roomId, sender, data, iv }) => {
    // save to DB
    db.run(
      "INSERT INTO messages (roomId, sender, data, iv) VALUES (?, ?, ?, ?)",
      [roomId, sender, JSON.stringify(data), JSON.stringify(iv)]
    );

    // broadcast
    io.to(roomId).emit("messages", [
      {
        sender,
        data,
        iv,
      },
    ]);
  });

  // =====================
  // 📞 CALL SIGNALING
  // =====================

  socket.on("call-offer", (offer) => {
    socket.broadcast.emit("call-offer", offer);
  });

  socket.on("call-answer", (answer) => {
    socket.broadcast.emit("call-answer", answer);
  });

  socket.on("call-candidate", (candidate) => {
    socket.broadcast.emit("call-candidate", candidate);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// =====================
// 🚀 START SERVER
// =====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});