// Reads the multipart form both sides post to the account thread (message text, payment fields,
// attached receipts) and saves the files.
import { z } from "zod";
import { MAX_FILES_PER_ENTRY, savePrivateFile, type PrivateFile } from "@/lib/private-files";
import { UploadError } from "@/lib/storage";

const fields = z.object({
  kind: z.enum(["PAYMENT", "MESSAGE"]).default("MESSAGE"),
  body: z.string().trim().max(4000).default(""),
  amount: z.coerce.number().positive().max(100_000_000).optional(),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(120).optional(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type EntryForm = z.infer<typeof fields> & { attachments: PrivateFile[] };

export async function readEntryForm(req: Request, allowPayment: boolean): Promise<{ ok: true; form: EntryForm } | { ok: false; error: string; status: number }> {
  const data = await req.formData().catch(() => null);
  if (!data) return { ok: false, error: "Invalid form", status: 400 };
  const text = (k: string) => {
    const v = data.get(k);
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const parsed = fields.safeParse({ kind: text("kind"), body: text("body"), amount: text("amount"), method: text("method"), reference: text("reference"), paidOn: text("paidOn") });
  if (!parsed.success) return { ok: false, error: "Check the amount and date", status: 400 };
  const f = parsed.data;
  if (f.kind === "PAYMENT" && !allowPayment) return { ok: false, error: "Only DukanWalley can record payments", status: 403 };
  if (f.kind === "PAYMENT" && !f.amount) return { ok: false, error: "Enter the amount paid", status: 400 };
  const files = data.getAll("files").filter((x): x is File => typeof x !== "string" && x.size > 0);
  if (files.length > MAX_FILES_PER_ENTRY) return { ok: false, error: `Attach at most ${MAX_FILES_PER_ENTRY} files`, status: 400 };
  if (f.kind === "MESSAGE" && !f.body && !files.length) return { ok: false, error: "Write a message or attach a file", status: 400 };
  const attachments: PrivateFile[] = [];
  try {
    for (const file of files) attachments.push(await savePrivateFile(file));
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message, status: e.status };
    throw e;
  }
  return { ok: true, form: { ...f, attachments } };
}

/** "2026-11-01" as noon Pakistan time, so the date never shifts across time zones. */
export function paidOnDate(ymd?: string) {
  return ymd ? new Date(`${ymd}T07:00:00Z`) : undefined;
}
