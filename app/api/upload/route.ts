import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const getSafeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("file");

    if (files.length === 0 || files.some((file) => !(file instanceof File))) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const uploadedUrls: string[] = [];
    const timestamp = Date.now();

    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const safeOriginalName = getSafeFileName(file.name);
      const fileName = `${timestamp}-${crypto.randomUUID()}-${safeOriginalName}`;
      const filePath = path.join(uploadsDir, fileName);

      await writeFile(filePath, buffer);
      uploadedUrls.push(`/uploads/${fileName}`);
    }

    return NextResponse.json({ fileUrls: uploadedUrls });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
