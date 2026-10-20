import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { slugify } from "@/lib/slug";

export async function GET() {
  const authz = await requirePermission("products:view");
  if (!authz.ok) return authz.response;
  const categories = await prisma.category.findMany({
    include: {
      attributeDefs: { orderBy: { name: "asc" } },
      _count: { select: { products: true, children: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ categories });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { name, parentId } = parsed.data;

  const parent = parentId ? await prisma.category.findUnique({ where: { id: parentId } }) : null;
  if (parentId && !parent) {
    return NextResponse.json({ error: "Unknown parent category" }, { status: 400 });
  }
  const base = slugify(name);
  if (!base) return NextResponse.json({ error: "Name needs letters or digits" }, { status: 400 });
  // Prefixed with the parent so "Men" can exist under both Shoes and Garments.
  const slug = parent ? `${parent.slug}-${base}` : base;
  if (await prisma.category.findUnique({ where: { slug } })) {
    return NextResponse.json({ error: "A category with this name already exists here" }, { status: 409 });
  }
  const category = await prisma.category.create({ data: { name, slug, parentId: parentId ?? null } });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CATEGORY_CREATE", entity: "Category", entityId: category.id },
  });
  return NextResponse.json({ category });
}
