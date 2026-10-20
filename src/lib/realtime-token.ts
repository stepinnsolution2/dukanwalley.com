import { createHmac, timingSafeEqual } from "crypto";

// Shared by the Next app and server/realtime.ts, so keep this free of Next imports.

export function getRealtimeSecret() {
  const secret = process.env.REALTIME_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("REALTIME_SECRET must be set in production");
  }
  return "dev-realtime-secret";
}

function sign(exp: number) {
  return createHmac("sha256", getRealtimeSecret()).update(`admin:${exp}`).digest("hex");
}

/** Short-lived token proving the holder is staff; checked when the socket connects. */
export function signAdminToken(ttlSeconds = 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${exp}.${sign(exp)}`;
}

export function verifyAdminToken(token: unknown) {
  if (typeof token !== "string") return false;
  const [expPart, sig = ""] = token.split(".");
  const exp = Number(expPart);
  if (!Number.isInteger(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
