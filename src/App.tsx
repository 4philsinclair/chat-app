import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "https://chat-app-tks0.onrender.com";

// 🔥 SINGLE SOCKET
const socket = io(BACKEND_URL, {
  transports: ["polling", "websocket"],
});

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [joined, setJoined] = useState(false);

  const roomId = "room1";

  // 🔐 LOGIN
  async function login() {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.success) {
      setUser(data.username);
      setMessages([]);
      setJoined(false);
    } else {
      alert(data.error);
    }
  }

  // 🔐 REGISTER
  async function register() {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.success) alert("Registered!");
    else alert(data.error);
  }

  // 🔑 JOIN ROOM
  useEffect(() => {
    if (!user || joined) return;

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

      setJoined(true);
    }

    setup();
  }, [user, joined]);

  // 🔐 SHARED KEY
  useEffect(() => {
    const handler = async (keys: any) => {
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
    };

    socket.on("publicKeys", handler);
    return () => socket.off("publicKeys", handler);
  }, [privateKey, user]);

  // 📥 RECEIVE (text + images)
  useEffect(() => {
    if (!sharedKey) return;

    let isFirstLoad = true;

    const handler = async (msgs: any[]) => {
      const newMessages = [];

      for (let m of msgs) {
        try {
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(m.iv) },
            sharedKey,
            new Uint8Array(m.data)
          );

          const text = new TextDecoder().decode(decrypted);

          if (text.startsWith("data:image")) {
            newMessages.push({
              sender: m.sender,
              image: text,
            });
          } else {
            newMessages.push({
              sender: m.sender,
              text,
            });
          }
        } catch (e) {
          console.log("❌ decrypt failed", e);
        }
      }

      if (isFirstLoad) {
        setMessages(newMessages);
        isFirstLoad = false;
      } else {
        setMessages((prev) => [...prev, ...newMessages]);
      }
    };

    socket.on("messages", handler);
    return () => socket.off("messages", handler);
  }, [sharedKey]);

  // 📤 SEND TEXT
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

  // 🖼 SEND IMAGE (FIXED)
 async function sendImage(e: React.ChangeEvent<HTMLInputElement>) {
  if (!sharedKey || !user) return;

  const file = e.target.files?.[0];
  if (!file) return;

  console.log("📷 selected:", file.name);

  // 🔥 STEP 1: load image
  const img = new Image();
  const reader = new FileReader();

  reader.onload = () => {
    img.src = reader.result as string;
  };

  img.onload = async () => {
    // 🔥 STEP 2: resize (VERY IMPORTANT)
    const canvas = document.createElement("canvas");
    const maxSize = 400;

    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxSize) {
        height *= maxSize / width;
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width *= maxSize / height;
        height = maxSize;
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, width, height);

    // 🔥 STEP 3: compress
    const base64 = canvas.toDataURL("image/jpeg", 0.6);

    console.log("📦 resized + compressed");

    try {
      const data = new TextEncoder().encode(base64);
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

      console.log("✅ image sent");
    } catch (err) {
      console.error("❌ encryption/send failed", err);
    }
  };

  reader.readAsDataURL(file);

  // 🔥 CRITICAL (mobile fix)
  e.target.value = "";
}

  // UI
  return (
    <div style={{ padding: 20 }}>
      {!user ? (
        <>
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
        </>
      ) : (
        <>
          <h3>{user}</h3>

          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b>{m.sender}:</b>

              {m.text && <div>{m.text}</div>}

              {m.image && (
                <img
                  src={m.image}
                  style={{ maxWidth: "200px", display: "block" }}
                />
              )}
            </div>
          ))}

          <br />

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button onClick={sendMessage}>Send</button>

          <br /><br />

          <input
            type="file"
            accept="image/*"
            onChange={sendImage}
          />
        </>
      )}
    </div>
  );
}

export default App;