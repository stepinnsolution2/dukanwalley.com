import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/importers/csv";
import { importMarkazProducts, parseShopifyRows, SOURCE, type ImportResult, type MarkazProduct } from "@/lib/importers/markaz";
import { readFirstSheet } from "@/lib/importers/xlsx";

// Admin › Products › Import: a Markaz export is parsed and dry-run into a preview, then imported
// in the background (image downloads take minutes) while the page polls ImportJob for progress.
// Importing is idempotent (products are matched by their Markaz id), so an interrupted job can
// simply be started again.

/** A running job that hasn't saved progress for this long was cut off (e.g. a server restart). */
const STALE_MS = 10 * 60_000;
const SAVE_EVERY_MS = 2_000;

export class ImportFileError extends Error {}

/** Rows of a Markaz export, from .xlsx or .csv. */
export function readSupplierFile(fileName: string, bytes: Buffer): string[][] {
  if (/\.xlsx$/i.test(fileName)) return readFirstSheet(bytes);
  if (/\.csv$/i.test(fileName)) return parseCsv(bytes.toString("utf8"));
  throw new ImportFileError("Upload the Markaz export as .xlsx or .csv");
}

/** Parses the file and dry-runs it (nothing saved, nothing downloaded) into a new preview job. */
export async function createPreviewJob(input: {
  fileName: string;
  bytes: Buffer;
  vendorId: string;
  stockPerItem: number;
  userId: string;
}) {
  let products: MarkazProduct[];
  try {
    products = parseShopifyRows(readSupplierFile(input.fileName, input.bytes));
  } catch (e) {
    throw e instanceof ImportFileError ? e : new ImportFileError(e instanceof Error ? e.message : String(e));
  }
  if (!products.length) throw new ImportFileError("No products found in this file");
  const preview = await importMarkazProducts(products, {
    vendorId: input.vendorId,
    stockPerItem: input.stockPerItem,
    dryRun: true,
  });
  return prisma.importJob.create({
    data: {
      source: SOURCE,
      fileName: input.fileName,
      vendorId: input.vendorId,
      stockPerItem: input.stockPerItem,
      createdById: input.userId,
      products: products as unknown as object,
      preview: preview as unknown as object,
      total: products.length,
    },
  });
}

/** "interrupted" for a running job that stopped reporting progress. */
export function effectiveStatus(job: { status: string; updatedAt: Date }) {
  return job.status === "running" && Date.now() - job.updatedAt.getTime() > STALE_MS ? "interrupted" : job.status;
}

/**
 * Marks the job running if it may start (a preview, or a failed/interrupted run) and no other
 * import is running. Returns an error message instead when it can't.
 */
export async function claimJob(id: string): Promise<string | null> {
  const others = await prisma.importJob.findMany({ where: { status: "running", id: { not: id } } });
  if (others.some((j) => effectiveStatus(j) === "running")) return "Another import is still running. Wait for it to finish.";
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) return "Import not found";
  const status = effectiveStatus(job);
  if (!["preview", "failed", "interrupted"].includes(status)) return `This import is already ${status}`;
  // Conditional update: only one request can move it to running.
  const { count } = await prisma.importJob.updateMany({
    where: { id, status: job.status, updatedAt: job.updatedAt },
    data: { status: "running", startedAt: new Date(), finishedAt: null, error: null, processed: 0, created: 0, updated: 0, skipped: 0 },
  });
  return count ? null : "This import was just started by someone else";
}

/** Runs a claimed job to the end, saving progress as it goes. Never throws. */
export async function runImportJob(id: string) {
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) return;
  const results: ImportResult[] = [];
  const tally = { created: 0, updated: 0, skipped: 0 };
  let lastSave = 0;
  // Saves are chained so a slow progress save can't land after (and overwrite) the final one.
  let saving: Promise<unknown> = Promise.resolve();
  const save = (extra: object = {}) => {
    saving = saving
      .catch(() => {})
      .then(() =>
        prisma.importJob.update({
          where: { id },
          data: { processed: results.length, ...tally, results: results as unknown as object, ...extra },
        }),
      );
    return saving;
  };

  try {
    await importMarkazProducts(job.products as unknown as MarkazProduct[], {
      vendorId: job.vendorId,
      stockPerItem: job.stockPerItem,
      onResult: (r) => {
        results.push(r);
        tally[r.action]++;
        if (Date.now() - lastSave > SAVE_EVERY_MS) {
          lastSave = Date.now();
          save().catch((e) => console.error("[import] progress save failed", e));
        }
      },
    });
    await save({ status: "done", finishedAt: new Date() });
    console.info(`[import] ${job.fileName}: ${tally.created} created, ${tally.updated} updated, ${tally.skipped} skipped`);
  } catch (e) {
    console.error("[import] failed", id, e);
    await save({ status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) }).catch(() => {});
  }
}
