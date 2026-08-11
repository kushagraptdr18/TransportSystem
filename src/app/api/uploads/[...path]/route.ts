import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  // the firm logo/seal upload accepts webp, so serving has to know it too —
  // without this it went out as octet-stream and no browser rendered it
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  let session;
  try {
    session = requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = () =>
    NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Harden every segment BEFORE any path math: decode (twice, to catch
  // double-encoding), then reject dot-segments, separators, NULs and empties —
  // an encoded ".." must never survive into the resolved path.
  const segments: string[] = [];
  for (const raw of params.path) {
    let seg = raw;
    try {
      for (let i = 0; i < 2; i++) seg = decodeURIComponent(seg);
    } catch {
      return forbidden();
    }
    if (
      !seg ||
      seg === "." ||
      seg === ".." ||
      seg.includes("/") ||
      seg.includes("\\") ||
      seg.includes("\0")
    ) {
      return forbidden();
    }
    segments.push(seg);
  }
  // tenant isolation: only serve files under the session tenant's directory
  if (segments[0] !== session.tenantId) return forbidden();

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
  const tenantRoot = path.resolve(uploadRoot, session.tenantId);
  const absPath = path.resolve(uploadRoot, segments.join("/"));
  // belt and braces: the RESOLVED path must stay inside the TENANT directory
  if (absPath !== tenantRoot && !absPath.startsWith(tenantRoot + path.sep)) {
    return forbidden();
  }

  try {
    const data = await readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${path.basename(absPath)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}
