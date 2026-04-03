import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// 🔥 IMPORTANT: use your IP here
const socket = io("http://192.168.1.120:3000");

function App() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [user, setUser] = useState("");

  // join once
  useEffect(() => {
    socket.emit("join");
  }, []);

  // receive history
  useEffect(() => {
    socket.on("history", (msgs) => {
      setMessages(msgs);
    });

    return () => socket.off("history");
  }, []);

  // receive new messages
  useEffect(() => {
    socket.on("message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => socket.off("message");
  }, []);

  function send() {
    if (!input || !user) return;

    socket.emit("send", {
      user,
      text: input,
    });

    setInput("");
  }

  return (
    <div style={{ padding: 20 }}>
      {!user ? (
        <>
          <h2>Enter your name</h2>
          <input
            placeholder="Your name"
            onChange={(e) => setUser(e.target.value)}
          />
        </>
      ) : (
        <>
          <h2>Chat ({user})</h2>

          {messages.map((m) => (
            <div key={m.id}>
              <b>{m.user}:</b> {m.text}
            </div>
          ))}

          <br />

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button onClick={send}>Send</button>
        </>
      )}
    </div>
  );
}

export default App;