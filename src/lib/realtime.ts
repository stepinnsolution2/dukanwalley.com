import { getRealtimeSecret } from "@/lib/realtime-token";

/** Fire-and-forget broadcast to the standalone Socket.IO admin room. */
export async function broadcastAdmin(event: string, data: unknown) {
  const base =
    process.env.REALTIME_HTTP_URL ??
    `http://127.0.0.1:${process.env.REALTIME_PORT ?? "3001"}`;
  const secret = getRealtimeSecret();
  try {
    await fetch(`${base}/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-realtime-secret": secret,
      },
      body: JSON.stringify({ room: "admin", event, data }),
    });
  } catch {
    /* realtime server optional in dev */
  }
}
