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

// 📦 DB
const db = new sqlite3.Database("./chat.db");

// users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`);

// messages table
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


// 🔐 REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hash],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "User exists" });
      }
      res.json({ success: true });
    }
  );
});


// 🔐 LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      const ok = await bcrypt.compare(password, user.password);

      if (!ok) {
        return res.status(400).json({ error: "Wrong password" });
      }

      res.json({ success: true, username });
    }
  );
});


// 🔌 SOCKET
io.on("connection", (socket) => {
  console.log("🔌 User connected");

  socket.on("joinRoom", ({ roomId, userId, publicKey }) => {
    socket.join(roomId);

    publicKeys[userId] = publicKey;

    io.to(roomId).emit("publicKeys", publicKeys);

    db.all(
      "SELECT * FROM messages WHERE roomId = ? ORDER BY id",
      [roomId],
      (err, rows) => {
        const msgs = rows.map((row) => ({
          sender: row.sender,
          data: JSON.parse(row.data),
          iv: JSON.parse(row.iv),
        }));

        socket.emit("messages", msgs);
      }
    );
  });

  socket.on("sendMessage", ({ roomId, sender, data, iv }) => {
    db.run(
      "INSERT INTO messages (roomId, sender, data, iv) VALUES (?, ?, ?, ?)",
      [roomId, sender, JSON.stringify(data), JSON.stringify(iv)],
      function () {
        db.all(
          "SELECT * FROM messages WHERE roomId = ? ORDER BY id",
          [roomId],
          (err, rows) => {
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
});

server.listen(3000, () => {
  console.log("🚀 Server with login running");
});