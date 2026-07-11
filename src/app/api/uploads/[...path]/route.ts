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

  const relPath = params.path.join("/");
  // tenant isolation: only serve files under the session tenant's directory
  if (!relPath.startsWith(`${session.tenantId}/`)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const absPath = path.resolve(uploadDir, relPath);
  // path traversal guard
  if (!absPath.startsWith(path.resolve(uploadDir) + path.sep)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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
