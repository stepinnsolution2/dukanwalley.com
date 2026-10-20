import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authz";
import { signAdminToken } from "@/lib/realtime-token";

/** Issues a Socket.IO token for the admin room (see server/realtime.ts). */
export async function GET() {
  const authz = await requirePermission("live:view");
  if (!authz.ok) return authz.response;
  return NextResponse.json({ token: signAdminToken() });
}
