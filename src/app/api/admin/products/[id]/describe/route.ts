import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authz";
import { DescriptionError, writeProductDescription } from "@/lib/ai/product-description";

type Params = { params: Promise<{ id: string }> };

/** Writes an AI description for the edit form to review; it's saved with the form. */
export async function POST(_req: Request, { params }: Params) {
  const authz = await requirePermission("products:edit");
  if (!authz.ok) return authz.response;
  try {
    const { description } = await writeProductDescription((await params).id);
    return NextResponse.json({ description });
  } catch (e) {
    if (e instanceof DescriptionError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
