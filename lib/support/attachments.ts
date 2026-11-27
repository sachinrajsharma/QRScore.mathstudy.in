import { hasMagicBytes, type UploadKind } from "../file-signature";
import { randomBytes } from "node:crypto";

/** Ticket attachments: which files are allowed and how a stored name is made. Pure; the storage itself is in store.ts. */
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const RULES: Record<string, { ext: string[]; kind: UploadKind }> = {
  "image/jpeg": { ext: [".jpg", ".jpeg"], kind: "jpeg" },
  "image/png": { ext: [".png"], kind: "png" },
  "application/pdf": { ext: [".pdf"], kind: "pdf" },
};
export const ACCEPT = ".jpg,.jpeg,.png,.pdf";

export type FileCheck = { ok: true; mime: string; ext: string } | { ok: false; error: string };

const extOf = (name: string): string => { const i = name.lastIndexOf("."); return i < 0 ? "" : name.slice(i).toLowerCase(); };

/** Type, extension, size and magic bytes must all agree. Anything that lies about its type is refused. */
export function checkFile(name: string, mime: string, size: number, head: ArrayBuffer): FileCheck {
  const rule = RULES[mime];
  const ext = extOf(name);
  if (!rule || !rule.ext.includes(ext)) return { ok: false, error: `${name || "A file"} is not allowed. Use JPG, PNG or PDF files.` };
  if (size <= 0) return { ok: false, error: `${name} is empty.` };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `${name} is larger than the 10 MB limit.` };
  if (!hasMagicBytes(head, rule.kind)) return { ok: false, error: `${name} does not look like a real ${rule.kind.toUpperCase()} file.` };
  return { ok: true, mime, ext };
}

/** Random name; the person's own file name is never used on disk. */
export const storedName = (ext: string, now: number = Date.now()): string => `${now}-${randomBytes(8).toString("hex")}${ext}`;

/** A name that is safe inside a Content-Disposition header. */
export const safeDownloadName = (name: string): string => name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file";

export const STORAGE_BUCKET = "support";
