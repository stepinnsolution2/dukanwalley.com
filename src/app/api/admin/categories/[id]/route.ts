import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  parentId: z.string().nullable().optional(),
});

/** Rename or move a category. The slug stays fixed so storefront links don't break. */
export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { name, parentId } = parsed.data;

  if (!(await prisma.category.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (parentId) {
    // Walk up from the new parent: reaching this category would create a loop.
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) {
        return NextResponse.json({ error: "A category can't be inside itself" }, { status: 400 });
      }
      const parent: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!parent) return NextResponse.json({ error: "Unknown parent category" }, { status: 400 });
      cursor = parent.parentId;
    }
  }
  const category = await prisma.category.update({
    where: { id },
    data: { ...(name !== undefined ? { name } : {}), ...(parentId !== undefined ? { parentId } : {}) },
  });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CATEGORY_UPDATE", entity: "Category", entityId: id, meta: parsed.data },
  });
  return NextResponse.json({ category });
}

/** Only empty categories (no products, no subcategories) can be deleted. */
export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true, commissionRules: true } } },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { products, children, commissionRules } = category._count;
  if (products || children || commissionRules) {
    return NextResponse.json(
      { error: `In use: ${products} products, ${children} subcategories, ${commissionRules} commission rules` },
      { status: 409 },
    );
  }
  await prisma.category.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CATEGORY_DELETE", entity: "Category", entityId: id, meta: { name: category.name } },
  });
  return NextResponse.json({ ok: true });
}
