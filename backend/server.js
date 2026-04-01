const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// 📦 DATABASE
const db = new sqlite3.Database("./chat.db");

// 👤 USERS TABLE
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// 💬 MESSAGES TABLE
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT,
    sender TEXT,
    data TEXT,
    iv TEXT
  )
`);

let publicKeys = {};

// =====================
// 🔐 AUTH ROUTES
// =====================

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hash],
      function (err) {
        if (err) {
          return res.status(400).json({ error: "User already exists" });
        }
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(400).json({ error: "User not found" });
      }

      const valid = await bcrypt.compare(password, user.password);

      if (!valid) {
        return res.status(400).json({ error: "Wrong password" });
      }

      res.json({ success: true, username });
    }
  );
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

    // store key
    publicKeys[userId] = publicKey;

    // broadcast keys
    io.to(roomId).emit("publicKeys", publicKeys);

    // send full message history
    db.all(
      "SELECT * FROM messages WHERE roomId = ? ORDER BY id",
      [roomId],
      (err, rows) => {
        if (err) {
          console.error(err);
          return;
        }

        const msgs = rows.map((row) => ({
          sender: row.sender,
          data: JSON.parse(row.data),
          iv: JSON.parse(row.iv),
        }));

        socket.emit("messages", msgs);
      }
    );
  });

  // SEND MESSAGE
  socket.on("sendMessage", ({ roomId, sender, data, iv }) => {
    db.run(
      "INSERT INTO messages (roomId, sender, data, iv) VALUES (?, ?, ?, ?)",
      [roomId, sender, JSON.stringify(data), JSON.stringify(iv)],
      function (err) {
        if (err) {
          console.error(err);
          return;
        }

        console.log(`📨 Message stored in ${roomId}`);

        // reload ALL messages (important for crypto sync)
        db.all(
          "SELECT * FROM messages WHERE roomId = ? ORDER BY id",
          [roomId],
          (err, rows) => {
            if (err) {
              console.error(err);
              return;
            }

            const msgs = rows.map((row) => ({
              sender: row.sender,
              data: JSON.parse(row.data),
              iv: JSON.parse(row.iv),
            }));

            io.to(roomId).emit("messages", msgs);
          }
        );
      }
    );
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