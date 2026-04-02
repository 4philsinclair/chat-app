import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const BACKEND_URL = "https://chat-app-tks0.onrender.com";

function getAvatar(name: string) {
  const colors = ["#f44336", "#2196f3", "#4caf50", "#ff9800", "#9c27b0"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return { letter: name[0].toUpperCase(), color };
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);

  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 🔌 SOCKET (FIXED FOR MOBILE)
  useEffect(() => {
    const s = io(BACKEND_URL, {
  transports: ["polling", "websocket"], // 👈 order matters!
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // 🔐 LOGIN
  async function login() {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
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
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) alert("Registered!");
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
        roomId: "room1",
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

          if (text.startsWith("data:image")) {
            newMessages.push({ sender: m.sender, image: text });
          } else {
            newMessages.push({ sender: m.sender, text });
          }
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
      roomId: "room1",
      sender: user,
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
    });

    setInput("");
  }

  // 📞 CALL (STUN + TURN placeholder)
  async function startCall() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // 👉 add TURN here later if needed
      ],
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      const audio = document.createElement("audio");
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audio.controls = true;
      document.body.appendChild(audio);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket?.emit("call-candidate", e.candidate);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket?.emit("call-offer", offer);
    setPeer(pc);
  }

  // RECEIVE CALL
  useEffect(() => {
    if (!socket) return;

    socket.on("call-offer", async (offer) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("call-answer", answer);
      setPeer(pc);
    });

    socket.on("call-answer", async (answer) => {
      await peer?.setRemoteDescription(answer);
    });

    socket.on("call-candidate", async (c) => {
      await peer?.addIceCandidate(c);
    });

  }, [socket, peer]);

  // UI
  return (
    <div style={{ padding: 20 }}>
      {!user ? (
        <>
          <h2>Login</h2>
          <input placeholder="Username" onChange={(e)=>setUsername(e.target.value)} />
          <input placeholder="Password" type="password" onChange={(e)=>setPassword(e.target.value)} />
          <br/><br/>
          <button onClick={login}>Login</button>
          <button onClick={register}>Register</button>
        </>
      ) : (
        <>
          <h3>{user} <button onClick={startCall}>📞</button></h3>

          {messages.map((m,i)=>(
            <div key={i}>{m.text}</div>
          ))}

          <input value={input} onChange={(e)=>setInput(e.target.value)} />
          <button onClick={sendMessage}>Send</button>
        </>
      )}
    </div>
  );
}

export default App;