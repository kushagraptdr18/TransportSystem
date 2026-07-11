import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB max for logo/seal images
const ALLOWED_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * POST multipart: { file, kind: "logo" | "seal" }
 * Saves under UPLOAD_DIR/<tenantId>/firm/ and updates Firm.logoPath / sealPath.
 * Serving is handled by the shared /api/uploads/[...path] route.
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await authorize(session, "settings", "edit");
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }
  if (kind !== "logo" && kind !== "seal") {
    return NextResponse.json({ ok: false, error: "kind must be 'logo' or 'seal'" }, { status: 400 });
  }

  const ext = ALLOWED_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Only JPG, PNG or WEBP images are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { ok: false, error: "Image must be smaller than 2 MB" },
      { status: 400 }
    );
  }

  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const relPath = `${session.tenantId}/firm/${randomUUID()}.${ext}`;
  const absPath = path.join(uploadDir, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.from(await file.arrayBuffer()));

  await withTenant(session.tenantId, async (tx) => {
    const before = await tx.firm.findUniqueOrThrow({ where: { id: session.firmId } });
    const after = await tx.firm.update({
      where: { id: session.firmId },
      data: kind === "logo" ? { logoPath: relPath } : { sealPath: relPath },
    });
    await audit(tx, session, {
      entity: "Firm",
      entityId: session.firmId,
      action: "UPDATE",
      before: { logoPath: before.logoPath, sealPath: before.sealPath },
      after: { logoPath: after.logoPath, sealPath: after.sealPath },
    });
  });

  return NextResponse.json({ ok: true, path: relPath });
}
