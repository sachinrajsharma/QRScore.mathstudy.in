import { MAX_FILES, checkFile } from "./attachments";
import type { Upload } from "./store";

/** The attachments of a submitted form: empty file inputs are ignored, every other file must pass checkFile (type, extension, size, magic bytes). */
export async function collectUploads(fd: FormData, key = "attachments"): Promise<{ ok: true; files: Upload[] } | { ok: false; error: string }> {
  const picked = fd.getAll(key).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0);
  if (picked.length > MAX_FILES) return { ok: false, error: `Please attach at most ${MAX_FILES} files.` };
  const files: Upload[] = [];
  for (const f of picked) {
    const buf = await f.arrayBuffer();
    const c = checkFile(f.name, f.type, f.size, buf.slice(0, 16));
    if (!c.ok) return c;
    files.push({ name: f.name, mime: c.mime, ext: c.ext, bytes: new Uint8Array(buf) });
  }
  return { ok: true, files };
}
