const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" },
});

// 🔥 DATABASE
const db = new sqlite3.Database("./chat.db", (err) => {
  if (err) {
    console.error("DB OPEN ERROR:", err);
  } else {
    console.log("✅ Connected to SQLite DB");
  }
});

// 🔥 CREATE TABLE
db.serialize(() => {
  db.run(
    `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      text TEXT
    )
    `,
    (err) => {
      if (err) {
        console.error("DB CREATE TABLE ERROR:", err);
      } else {
        console.log("✅ Messages table ready");
      }
    }
  );
});

// 🔥 SOCKET LOGIC
io.on("connection", (socket) => {
  console.log("🔌 CONNECTED:", socket.id);

  // 🔥 LOAD HISTORY
  socket.on("join", () => {
    console.log("📥 JOIN:", socket.id);

    db.all("SELECT * FROM messages", (err, rows) => {
      if (err) {
        console.error("DB READ ERROR:", err);
        return;
      }

      console.log("📦 Sending history:", rows.length);
      socket.emit("history", rows);
    });
  });

  // 🔥 SEND MESSAGE
  socket.on("send", ({ user, text }) => {
    console.log("📨 RECEIVED:", user, text);

    db.run(
      "INSERT INTO messages (user, text) VALUES (?, ?)",
      [user, text],
      function (err) {
        if (err) {
          console.error("DB INSERT ERROR:", err);
          return;
        }

        const msg = {
          id: this.lastID,
          user,
          text,
        };

        console.log("📤 BROADCAST:", msg);

        io.emit("message", msg);
      }
    );
  });

  socket.on("disconnect", () => {
    console.log("❌ DISCONNECTED:", socket.id);
  });
});

// 🔥 START SERVER (NETWORK ACCESSIBLE)
server.listen(3000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://0.0.0.0:3000");
});