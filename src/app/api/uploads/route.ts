import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { saveUpload, UploadError, type MediaKind } from "@/lib/storage";

/**
 * Upload one image or video (raw request body, one file per request) for product listings.
 * Sales staff and catalog editors only. Returns { url } to put in imageUrls / videoUrls.
 *   POST /api/uploads?kind=image|video
 */
export async function POST(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id || (role !== "SALES" && !can(role, "products:edit"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "kind must be image or video" }, { status: 400 });
  }
  if (!req.body) return NextResponse.json({ error: "Empty file" }, { status: 400 });

  try {
    const saved = await saveUpload(req.body, kind as MediaKind);
    return NextResponse.json(saved);
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
