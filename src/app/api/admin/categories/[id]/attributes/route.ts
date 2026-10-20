import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { ATTRIBUTE_TYPES } from "@/lib/catalog";

type Params = { params: Promise<{ id: string }> };

const attributeSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Key: lowercase letters, digits, underscores"),
    dataType: z.enum(ATTRIBUTE_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1)).max(100).default([]),
    isVariant: z.boolean().default(false),
  })
  .refine((a) => a.dataType !== "select" || a.options.length > 0, {
    message: "A list attribute needs at least one option",
    path: ["options"],
  })
  .refine((a) => !a.isVariant || a.dataType !== "boolean", {
    message: "A yes/no field can't be chosen by shoppers",
    path: ["isVariant"],
  });

const bodySchema = z.object({
  attributes: z
    .array(attributeSchema)
    .max(40)
    .refine((list) => new Set(list.map((a) => a.key)).size === list.length, "Attribute keys must be unique"),
});

/**
 * Replaces a category's attribute list (the fields shown on product forms, e.g. Size for Shoes).
 * Existing product values are kept in product metadata even if an attribute is removed.
 */
export async function PUT(req: Request, { params }: Params) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!(await prisma.category.findUnique({ where: { id } }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { attributes } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.categoryAttribute.deleteMany({
      where: { categoryId: id, key: { notIn: attributes.map((a) => a.key) } },
    });
    for (const a of attributes) {
      const data = {
        name: a.name,
        dataType: a.dataType,
        required: a.required,
        options: a.dataType === "select" ? a.options : [],
        isVariant: a.isVariant,
      };
      await tx.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: id, key: a.key } },
        create: { categoryId: id, key: a.key, ...data },
        update: data,
      });
    }
  });
  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "CATEGORY_ATTRIBUTES",
      entity: "Category",
      entityId: id,
      meta: { keys: attributes.map((a) => a.key) },
    },
  });
  const saved = await prisma.categoryAttribute.findMany({ where: { categoryId: id }, orderBy: { name: "asc" } });
  return NextResponse.json({ attributes: saved });
}
