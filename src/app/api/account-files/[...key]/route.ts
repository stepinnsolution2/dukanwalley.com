import { Readable } from "stream";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { openPrivateFile, type PrivateFile } from "@/lib/private-files";

type Params = { params: Promise<{ key: string[] }> };

/** A file attached in a vendor account thread: for staff with finance access and that vendor only. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Not found", { status: 404 });
  const key = (await params).key.join("/");
  const entry = await prisma.vendorAccountEntry.findFirst({
    where: { attachments: { array_contains: [{ key }] } },
    select: { attachments: true, vendor: { select: { userId: true } } },
  });
  const allowed = entry && (can(session.user.role, "finance:view") || entry.vendor.userId === session.user.id);
  const meta = (entry?.attachments as PrivateFile[] | undefined)?.find((a) => a.key === key);
  const file = allowed && meta ? await openPrivateFile(key) : null;
  if (!file || !meta) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(file.stream()) as ReadableStream, {
    headers: {
      "Content-Type": meta.type,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${meta.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
