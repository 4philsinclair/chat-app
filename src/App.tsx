import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// 🔥 IMPORTANT — replace with YOUR Render URL
const BACKEND_URL = "https://chat-app-tks0.onrender.com";

const socket = io(BACKEND_URL);

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [roomId, setRoomId] = useState("room1");

  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);

  // =====================
  // 🔐 LOGIN
  // =====================
  async function login() {
    try {
      const res = await fetch(`${BACKEND_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      console.log("LOGIN RESPONSE:", data);

      if (data.success) {
        setUser(data.username); // 🔥 CRITICAL
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Login failed");
    }
  }

  // =====================
  // 🔐 REGISTER
  // =====================
  async function register() {
    try {
      const res = await fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      console.log("REGISTER RESPONSE:", data);

      if (data.success) {
        alert("Registered! Now login.");
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Register failed");
    }
  }

  // =====================
  // 🔑 KEY SETUP
  // =====================
  useEffect(() => {
    if (!user) return;

    async function setup() {
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );

      setPrivateKey(keyPair.privateKey);

      const publicKey = await crypto.subtle.exportKey(
        "raw",
        keyPair.publicKey
      );

      socket.emit("joinRoom", {
        roomId,
        userId: user,
        publicKey: Array.from(new Uint8Array(publicKey)),
      });

      console.log("🔑 Joined room:", roomId);
    }

    setup();
  }, [user]);

  // =====================
  // 🔐 SHARED KEY
  // =====================
  useEffect(() => {
    socket.on("publicKeys", async (keys) => {
      if (!privateKey || !user) return;

      for (const id in keys) {
        if (id === user) continue;

        const otherKey = await crypto.subtle.importKey(
          "raw",
          new Uint8Array(keys[id]),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          []
        );

        const key = await crypto.subtle.deriveKey(
          { name: "ECDH", public: otherKey },
          privateKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );

        console.log("🔐 Shared key ready");
        setSharedKey(key);
      }
    });

    return () => socket.off("publicKeys");
  }, [privateKey, user]);

  // =====================
  // 📥 RECEIVE
  // =====================
  useEffect(() => {
    socket.on("messages", async (msgs) => {
      if (!sharedKey) return;

      const newMessages = [];

      for (let m of msgs) {
        try {
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(m.iv) },
            sharedKey,
            new Uint8Array(m.data)
          );

          newMessages.push({
            sender: m.sender,
            text: new TextDecoder().decode(decrypted),
          });
        } catch {
          console.log("❌ decrypt failed");
        }
      }

      setMessages(newMessages);
    });

    return () => socket.off("messages");
  }, [sharedKey]);

  // =====================
  // 📤 SEND
  // =====================
  async function sendMessage() {
    if (!sharedKey || !input || !user) return;

    const data = new TextEncoder().encode(input);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      data
    );

    socket.emit("sendMessage", {
      roomId,
      sender: user,
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
    });

    setInput("");
  }

  // =====================
  // 🔐 LOGIN SCREEN
  // =====================
  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Login</h2>

        <input
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          placeholder="Password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <br /><br />

        <button onClick={login}>Login</button>
        <button onClick={register}>Register</button>
      </div>
    );
  }

  // =====================
  // 💬 CHAT UI
  // =====================
  return (
    <div style={{ padding: 20 }}>
      <h2>🔐 {user} in {roomId}</h2>

      <div>
        {messages.map((m, i) => (
          <div key={i}>
            💬 {m.sender}: {m.text}
          </div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Message..."
      />

      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default App;