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

const db = new sqlite3.Database("./chat.db");

// DB setup
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

// AUTH
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) return res.json({ success: false, error: "User exists" });
      res.json({ success: true });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, row) => {
      if (row) res.json({ success: true, username });
      else res.json({ success: false, error: "Invalid login" });
    }
  );
});

// SOCKET
const publicKeys = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("joinRoom", ({ roomId, userId, publicKey }) => {
    socket.join(roomId);

    if (!publicKeys[roomId]) publicKeys[roomId] = {};
    publicKeys[roomId][userId] = publicKey;

    io.to(roomId).emit("publicKeys", publicKeys[roomId]);

    // send history
    db.all(
      "SELECT * FROM messages WHERE roomId=?",
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

  socket.on("sendMessage", ({ roomId, sender, data, iv }) => {
    const msg = { sender, data, iv };

    db.run(
      "INSERT INTO messages (roomId, sender, data, iv) VALUES (?, ?, ?, ?)",
      [roomId, sender, JSON.stringify(data), JSON.stringify(iv)]
    );

    io.to(roomId).emit("messages", [msg]);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

server.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);