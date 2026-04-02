import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const BACKEND_URL = "https://chat-app-tks0.onrender.com";

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);

  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [roomId] = useState("room1");

  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 🔌 SOCKET
  useEffect(() => {
    const s = io(BACKEND_URL);
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // 🔐 LOGIN
  async function login() {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (data.success) setUser(data.username);
    else alert(data.error);
  }

  // 🔐 REGISTER
  async function register() {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (data.success) alert("Registered! Now login.");
    else alert(data.error);
  }

  // 🔑 KEY SETUP
  useEffect(() => {
    if (!user || !socket) return;

    async function setup() {
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );

      setPrivateKey(keyPair.privateKey);

      const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);

      socket.emit("joinRoom", {
        roomId,
        userId: user,
        publicKey: Array.from(new Uint8Array(publicKey)),
      });
    }

    setup();
  }, [user, socket]);

  // 🔐 SHARED KEY
  useEffect(() => {
    if (!socket) return;

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

        setSharedKey(key);
      }
    });

    return () => socket.off("publicKeys");
  }, [socket, privateKey, user]);

  // 📥 RECEIVE
  useEffect(() => {
    if (!socket) return;

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

          const text = new TextDecoder().decode(decrypted);

          newMessages.push({
            sender: m.sender,
            text,
            time: new Date().toLocaleTimeString(),
          });
        } catch {}
      }

      setMessages(newMessages);
    });

    return () => socket.off("messages");
  }, [socket, sharedKey]);

  // 📤 SEND
  async function sendMessage() {
    if (!sharedKey || !input || !user || !socket) return;

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

  // ⬇️ AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // UI
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#ece5dd",
      }}
    >
      <div
        style={{
          width: 400,
          height: "90vh",
          background: "white",
          display: "flex",
          flexDirection: "column",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {!user ? (
          <div style={{ padding: 20 }}>
            <h2>Login</h2>

            <input placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
            <input
              placeholder="Password"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
            />

            <br /><br />

            <button onClick={login}>Login</button>
            <button onClick={register}>Register</button>
          </div>
        ) : (
          <>
            {/* HEADER */}
            <div
              style={{
                background: "#075e54",
                color: "white",
                padding: 10,
              }}
            >
              🔐 {user} — {roomId}
            </div>

            {/* MESSAGES */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 10,
              }}
            >
              {messages.map((m, i) => {
                const isMe = m.sender === user;

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isMe ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        background: isMe ? "#dcf8c6" : "#fff",
                        padding: 10,
                        borderRadius: 10,
                        maxWidth: "70%",
                        boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                      }}
                    >
                      {!isMe && (
                        <div style={{ fontSize: 10, opacity: 0.6 }}>
                          {m.sender}
                        </div>
                      )}

                      <div>{m.text}</div>

                      <div
                        style={{
                          fontSize: 10,
                          textAlign: "right",
                          marginTop: 4,
                          opacity: 0.6,
                        }}
                      >
                        {m.time}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* INPUT */}
            <div
              style={{
                display: "flex",
                padding: 10,
                borderTop: "1px solid #ddd",
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                style={{ flex: 1, marginRight: 10 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />

              <button onClick={sendMessage}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;