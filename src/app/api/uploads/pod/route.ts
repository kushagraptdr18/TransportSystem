import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

const MIN_SIZE = 2 * 1024 * 1024; // 2 MB minimum
const ALLOWED_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

export async function POST(req: NextRequest) {
  let session;
  try {
    session = requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }

  const ext =
    ALLOWED_EXT[file.type] ??
    (["pdf", "jpg", "jpeg", "png"].includes(
      (file.name.split(".").pop() ?? "").toLowerCase()
    )
      ? (file.name.split(".").pop() as string).toLowerCase().replace("jpeg", "jpg")
      : null);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Only PDF, JPG or PNG files are allowed" },
      { status: 400 }
    );
  }

  if (file.size < MIN_SIZE) {
    return NextResponse.json(
      {
        ok: false,
        error: `POD file must be at least 2 MB (received ${(file.size / (1024 * 1024)).toFixed(2)} MB). Please upload a higher-quality scan.`,
      },
      { status: 400 }
    );
  }

  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const relPath = `${session.tenantId}/pod/${randomUUID()}.${ext}`;
  const absPath = path.join(uploadDir, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buffer);

  return NextResponse.json({ ok: true, path: relPath, size: file.size });
}
