import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { sellableVendorWhere } from "@/lib/catalog";
import { createPreviewJob, effectiveStatus, ImportFileError } from "@/lib/importers/import-jobs";
import { ensureHouseStore } from "@/lib/importers/markaz";

const MAX_BYTES = 15 * 1024 * 1024;

/** Recent imports and the stores products can be imported into (Pakistan; Markaz prices are PKR). */
export async function GET() {
  const authz = await requirePermission("products:import");
  if (!authz.ok) return authz.response;
  const house = await ensureHouseStore("Marketplace Store");
  const [stores, jobs] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { ...sellableVendorWhere, market: "PK" },
      select: { id: true, storeName: true },
      orderBy: { storeName: "asc" },
    }),
    prisma.importJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, fileName: true, status: true, total: true, processed: true, created: true,
        updated: true, skipped: true, createdAt: true, updatedAt: true, finishedAt: true,
      },
    }),
  ]);
  return NextResponse.json({
    houseStoreId: house.id,
    stores,
    jobs: jobs.map((j) => ({ ...j, status: effectiveStatus(j) })),
  });
}

/** Upload (multipart: file, vendorId, stockPerItem): parse and dry-run into a preview. */
export async function POST(req: Request) {
  const authz = await requirePermission("products:import");
  if (!authz.ok) return authz.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 15 MB" }, { status: 400 });
  const stockPerItem = Number(form?.get("stockPerItem") ?? 50);
  if (!Number.isInteger(stockPerItem) || stockPerItem < 0 || stockPerItem > 100_000) {
    return NextResponse.json({ error: "Stock per item must be a whole number" }, { status: 400 });
  }
  const vendorId = String(form?.get("vendorId") ?? "");
  const store = await prisma.vendorProfile.findFirst({ where: { id: vendorId, ...sellableVendorWhere, market: "PK" } });
  if (!store) return NextResponse.json({ error: "Choose a Pakistan store that is approved to sell" }, { status: 400 });

  try {
    const job = await createPreviewJob({
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      vendorId: store.id,
      stockPerItem,
      userId: authz.session.user.id,
    });
    return NextResponse.json({ id: job.id });
  } catch (e) {
    if (e instanceof ImportFileError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
