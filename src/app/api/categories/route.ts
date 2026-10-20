import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mergeInheritedAttributes } from "@/lib/catalog";

/** Categories with their fields, including those inherited from parent categories. */
export async function GET() {
  const categories = await prisma.category.findMany({
    include: { attributeDefs: true },
    orderBy: { name: "asc" },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  return NextResponse.json({
    categories: categories.map((c) => ({ ...c, attributeDefs: mergeInheritedAttributes(c.id, byId) })),
  });
}
