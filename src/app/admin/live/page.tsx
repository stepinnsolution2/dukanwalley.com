"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function AdminLivePage() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const url =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://127.0.0.1:3001"
        : "";
    if (!url) return;
    // A fresh token is fetched on every (re)connect; the server checks it at handshake.
    const socket: Socket = io(url, {
      transports: ["websocket"],
      auth: (cb) => {
        fetch("/api/realtime/token")
          .then((r) => (r.ok ? r.json() : {}))
          .then((j: { token?: string }) => cb({ token: j.token }))
          .catch(() => cb({}));
      },
    });
    socket.on("order:new", (payload: { summary?: string }) => {
      setLog((l) => [`order: ${payload.summary ?? JSON.stringify(payload)}`, ...l].slice(0, 50));
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Live activity</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Run <code className="rounded bg-zinc-200 px-1">npm run dev:all</code> and set{" "}
        <code className="rounded bg-zinc-200 px-1">NEXT_PUBLIC_REALTIME_URL</code> to your Socket.IO
        origin (default <code className="rounded bg-zinc-200 px-1">http://127.0.0.1:3001</code>).
      </p>
      <ul className="mt-6 space-y-1 font-mono text-xs text-zinc-800">
        {log.length === 0 ? (
          <li className="text-zinc-500">Waiting for events…</li>
        ) : (
          log.map((line, i) => <li key={i}>{line}</li>)
        )}
      </ul>
    </div>
  );
}
