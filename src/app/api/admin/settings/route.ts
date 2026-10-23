import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { saveIntegrationSettings, SettingsValidationError } from "@/lib/integration-settings";

// Owner-only: save payment gateway and SMTP settings from Admin › Settings.
const bodySchema = z.object({ changes: z.record(z.string(), z.string().max(500).nullable()) });

export async function PUT(req: Request) {
  const authz = await requirePermission("settings:manage");
  if (!authz.ok) return authz.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let changed: string[];
  try {
    changed = await saveIntegrationSettings(parsed.data.changes);
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
    }
    throw e;
  }
  if (changed.length) {
    await prisma.auditLog.create({
      data: {
        userId: authz.session.user.id,
        action: "ADMIN_UPDATE_INTEGRATIONS",
        entity: "PlatformSetting",
        entityId: "INTEGRATIONS",
        // Names only: values (and secrets) never go to the audit log.
        meta: { changed },
      },
    });
  }
  return NextResponse.json({ ok: true, changed });
}
