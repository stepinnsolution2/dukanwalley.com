import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import {
  aiDescriptionsConfigured,
  bulkDescriptionState,
  DescriptionError,
  runBulkDescriptions,
} from "@/lib/ai/product-description";

const MAX_PER_RUN = 500;

const startSchema = z.object({
  /** Specific products, or every product whose description wasn't written by AI yet. */
  ids: z.array(z.string().min(1)).max(MAX_PER_RUN).optional(),
  allMissing: z.boolean().optional(),
});

/** Progress of the current or last bulk run, and how many products still need a description. */
export async function GET() {
  const authz = await requirePermission("products:view");
  if (!authz.ok) return authz.response;
  const [written, total] = await Promise.all([
    prisma.product.count({ where: { descriptionWrittenAt: { not: null } } }),
    prisma.product.count(),
  ]);
  return NextResponse.json({ configured: await aiDescriptionsConfigured(), written, total, run: bulkDescriptionState() });
}

export async function POST(req: Request) {
  const authz = await requirePermission("products:edit");
  if (!authz.ok) return authz.response;
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.allMissing)) {
    return NextResponse.json({ error: "Choose products" }, { status: 400 });
  }
  if (!(await aiDescriptionsConfigured())) {
    return NextResponse.json({ error: "Add your Anthropic API key in Admin › Settings › AI product descriptions first" }, { status: 400 });
  }
  if (bulkDescriptionState().running) return NextResponse.json({ error: "A run is already in progress" }, { status: 409 });
  const ids = parsed.data.ids?.length
    ? parsed.data.ids
    : (
        await prisma.product.findMany({
          where: { descriptionWrittenAt: null },
          select: { id: true },
          orderBy: { createdAt: "asc" },
          take: MAX_PER_RUN,
        })
      ).map((p) => p.id);
  if (!ids.length) return NextResponse.json({ error: "Every product already has an AI description" }, { status: 400 });

  after(() =>
    runBulkDescriptions(ids).catch((e) => {
      if (!(e instanceof DescriptionError)) console.error("[ai] bulk descriptions failed", e);
    }),
  );
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "AI_DESCRIPTIONS_BULK", entity: "Product", meta: { count: ids.length } },
  });
  return NextResponse.json({ started: ids.length });
}
