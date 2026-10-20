import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { can, isStaff, type Permission } from "@/lib/permissions";

type Authorized = { ok: true; session: Session & { user: { id: string; role: string } } };
type Denied = { ok: false; response: NextResponse };

/**
 * For Route Handlers. Usage:
 *   const authz = await requirePermission("vendors:manage");
 *   if (!authz.ok) return authz.response;
 */
export async function requirePermission(...permissions: Permission[]): Promise<Authorized | Denied> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || !isStaff(role)) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const missing = permissions.filter((p) => !can(role, p));
  if (missing.length) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Your role cannot do this (${missing.join(", ")})` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session: session as Authorized["session"] };
}

/** For admin pages and layouts: sends staff without the permission back to the overview. */
export async function requirePagePermission(permission: Permission) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/admin");
  if (!can(session.user.role, permission)) redirect("/admin?denied=1");
  return session;
}
