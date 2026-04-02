const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// 📦 DATABASE (SYNC, RENDER SAFE)
const db = new Database("chat.db");

// 👤 USERS TABLE
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`).run();

// 💬 MESSAGES TABLE
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT,
    sender TEXT,
    data TEXT,
    iv TEXT
  )
`).run();

let publicKeys = {};

// =====================
// 🔐 AUTH ROUTES
// =====================

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)"
    ).run(username, hash);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "User already exists" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.status(400).json({ error: "Wrong password" });
  }

  res.json({ success: true, username });
});

// =====================
// 🔌 SOCKET.IO
// =====================

io.on("connection", (socket) => {
  console.log("🔌 User connected");

  // JOIN ROOM
  socket.on("joinRoom", ({ roomId, userId, publicKey }) => {
    socket.join(roomId);

    console.log(`🚪 ${userId} joined ${roomId}`);

    // store public key
    publicKeys[userId] = publicKey;

    // broadcast keys
    io.to(roomId).emit("publicKeys", publicKeys);

    // load ALL messages (ordered)
    const rows = db
      .prepare("SELECT * FROM messages WHERE roomId = ? ORDER BY id")
      .all(roomId);

    const msgs = rows.map((row) => ({
      sender: row.sender,
      data: JSON.parse(row.data),
      iv: JSON.parse(row.iv),
    }));

    socket.emit("messages", msgs);
  });

  // SEND MESSAGE
  socket.on("sendMessage", ({ roomId, sender, data, iv }) => {
    try {
      db.prepare(
        "INSERT INTO messages (roomId, sender, data, iv) VALUES (?, ?, ?, ?)"
      ).run(roomId, sender, JSON.stringify(data), JSON.stringify(iv));

      console.log(`📨 Message stored in ${roomId}`);

      // reload FULL history (critical for crypto sync)
      const rows = db
        .prepare("SELECT * FROM messages WHERE roomId = ? ORDER BY id")
        .all(roomId);

      const msgs = rows.map((row) => ({
        sender: row.sender,
        data: JSON.parse(row.data),
        iv: JSON.parse(row.iv),
      }));

      io.to(roomId).emit("messages", msgs);
    } catch (err) {
      console.error("❌ DB error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected");
  });
});

// =====================
// 🚀 START SERVER (RENDER SAFE)
// =====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});