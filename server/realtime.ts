import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { getRealtimeSecret, verifyAdminToken } from "../src/lib/realtime-token";

const port = Number(process.env.REALTIME_PORT ?? 3001);
const secret = getRealtimeSecret();

const httpServer = createServer((req, res) => {
  if (req.url === "/emit" && req.method === "POST") {
    const h = req.headers["x-realtime-secret"];
    if (h !== secret) {
      res.writeHead(401);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          room?: string;
          event?: string;
          data?: unknown;
        };
        if (body.room && body.event) {
          io.to(body.room).emit(body.event, body.data ?? {});
        }
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: process.env.NEXT_PUBLIC_APP_URL ?? "*", methods: ["GET", "POST"] },
});

// Order events carry buyer details, so only sockets presenting a staff token
// (from /api/realtime/token) may join the admin room.
io.on("connection", (socket) => {
  if (verifyAdminToken(socket.handshake.auth?.token)) {
    socket.join("admin");
  } else {
    socket.disconnect(true);
  }
});

httpServer.listen(port, () => {
  console.log(`Realtime Socket.IO + HTTP emit on http://127.0.0.1:${port}`);
});
