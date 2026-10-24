import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { claimJob, effectiveStatus, runImportJob } from "@/lib/importers/import-jobs";

type Params = { params: Promise<{ id: string }> };

/** Preview, progress and results of one import (the parsed products themselves stay server-side). */
export async function GET(_req: Request, { params }: Params) {
  const authz = await requirePermission("products:import");
  if (!authz.ok) return authz.response;
  const job = await prisma.importJob.findUnique({
    where: { id: (await params).id },
    omit: { products: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const store = await prisma.vendorProfile.findUnique({ where: { id: job.vendorId }, select: { storeName: true } });
  return NextResponse.json({ job: { ...job, status: effectiveStatus(job), storeName: store?.storeName ?? "?" } });
}

/** Start (or resume) the import. It runs in the background; poll GET for progress. */
export async function POST(_req: Request, { params }: Params) {
  const authz = await requirePermission("products:import");
  if (!authz.ok) return authz.response;
  const id = (await params).id;
  const error = await claimJob(id);
  if (error) return NextResponse.json({ error }, { status: 409 });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "PRODUCT_IMPORT_START", entity: "ImportJob", entityId: id },
  });
  after(() => runImportJob(id));
  return NextResponse.json({ ok: true });
}
