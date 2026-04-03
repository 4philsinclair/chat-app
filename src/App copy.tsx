import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

function App() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  // 🔥 join once
  useEffect(() => {
    socket.emit("join");
  }, []);

  // 🔥 history (replace)
  useEffect(() => {
    socket.on("history", (msgs) => {
      setMessages(msgs);
    });

    return () => socket.off("history");
  }, []);

  // 🔥 new messages (append)
  useEffect(() => {
    socket.on("message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => socket.off("message");
  }, []);

  function send() {
    if (!input) return;
    socket.emit("send", input);
    setInput("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Clean Chat</h2>

      {messages.map((m) => (
        <div key={m.id}>{m.text}</div>
      ))}

      <br />

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button onClick={send}>Send</button>
    </div>
  );
}

export default App;