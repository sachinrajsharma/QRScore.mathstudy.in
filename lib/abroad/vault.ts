import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { all, one, run, val } from "../portal/db";
import { appSecret } from "../portal/crypto";
import * as storage from "../market/storage";
import * as scanner from "./scanner";

/**
 * Private document vault for study-abroad applications (port of Portal\Vault). Files live in the private "vault" storage bucket under random
 * names; they are only served through short-lived signed links to the owner (or an authorised counselor / admin) and every access is audited.
 */
export const TYPES: Record<string, string> = {
  passport: "Passport", transcripts: "Academic transcripts", sop: "Statement of purpose", lor: "Letter of recommendation",
  english: "English test result", financial: "Financial documents", cv: "CV / resume", other: "Other",
};
export const REQUIRED = ["passport", "transcripts", "sop"];
export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 30;
export const ALLOWED: Record<string, string[]> = { pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] };
const LINK_TTL = 300; // seconds

export interface Doc { id: number; user_id: number; doc_type: string; original_name: string; stored_name: string; mime: string; size: number; status: string; reject_reason: string; verified_by: number | null; verified_at: string | null; created_at: string; scan_status: string; scan_note: string }

export async function forUser(uid: number): Promise<Doc[]> {
  return all<Doc>("SELECT * FROM sa_documents WHERE user_id = $1 ORDER BY created_at DESC, id DESC", [uid]);
}

export async function find(id: number): Promise<Doc | null> {
  return one<Doc>("SELECT * FROM sa_documents WHERE id = $1", [id]);
}

/** Required document types that are missing (rejected files do not count). */
export async function missingRequired(uid: number): Promise<string[]> {
  const have = (await all<{ doc_type: string }>("SELECT DISTINCT doc_type FROM sa_documents WHERE user_id = $1 AND status <> 'rejected'", [uid])).map((r) => r.doc_type);
  return REQUIRED.filter((t) => !have.includes(t));
}

/** Required types that are not yet verified by a counselor. */
export async function unverifiedRequired(uid: number): Promise<string[]> {
  const ok = (await all<{ doc_type: string }>("SELECT DISTINCT doc_type FROM sa_documents WHERE user_id = $1 AND status = 'verified'", [uid])).map((r) => r.doc_type);
  return REQUIRED.filter((t) => !ok.includes(t));
}

/** The file signature must match the extension: the declared type is never trusted. */
export function sniff(bytes: Uint8Array, ext: string): string | null {
  const h = (sig: number[]) => sig.every((x, i) => bytes[i] === x);
  if (ext === "pdf" && h([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if ((ext === "jpg" || ext === "jpeg") && h([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ext === "png" && h([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (ext === "docx" && h([0x50, 0x4b])) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

/** Returns the new document id, or an error message. `audit` is injected to avoid a circular import with the store. */
export async function upload(uid: number, type: string, file: { name: string; size: number; bytes: Uint8Array }, audit: (action: string, detail: string) => Promise<void>): Promise<number | string> {
  if (!TYPES[type]) return "Choose a document type.";
  if (file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_BYTES) return "That file is too large (maximum 8 MB).";
  if (Number(await val("SELECT COUNT(*) FROM sa_documents WHERE user_id = $1", [uid])) >= MAX_FILES) return `You have reached the limit of ${MAX_FILES} documents. Delete one to add another.`;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = ALLOWED[ext] ? sniff(file.bytes, ext) : null;
  if (!mime) return "Upload a PDF, JPG, PNG or DOCX file.";
  const [scan, note] = await scanner.scan(file.bytes, ext);
  if (scan !== "clean") {
    await audit("doc.blocked", `${type}: ${note}`.slice(0, 120));
    return `That file did not pass our security check: ${note}.`;
  }
  const stored = randomBytes(20).toString("hex") + "." + ext;
  if (!(await storage.put("vault", stored, file.bytes, mime))) return "We could not save that file. Please try again.";
  const name = file.name.replace(/[^\p{L}\p{N}_ .\-()]+/gu, "_").slice(0, 160);
  const id = await val<number>("INSERT INTO sa_documents (user_id, doc_type, original_name, stored_name, mime, size, status, scan_status, scan_note, created_at) VALUES ($1,$2,$3,$4,$5,$6,'uploaded','clean',$7,NOW()) RETURNING id", [uid, type, name, stored, mime, file.size, note]);
  return Number(id);
}

export async function remove(uid: number, id: number): Promise<boolean> {
  const d = await find(id);
  if (!d || Number(d.user_id) !== uid) return false;
  await storage.remove("vault", d.stored_name.replace(/^.*[\\/]/, ""));
  await run("DELETE FROM sa_documents WHERE id = $1", [id]);
  return true;
}

export async function deleteAllFor(uid: number): Promise<number> {
  const docs = await forUser(uid);
  for (const d of docs) await storage.remove("vault", d.stored_name.replace(/^.*[\\/]/, ""));
  await run("DELETE FROM sa_documents WHERE user_id = $1", [uid]);
  return docs.length;
}

// ---- signed, expiring links -----------------------------------------------------------------------------------------------

async function sign(id: number, viewer: number, exp: number): Promise<string> {
  return createHmac("sha256", await appSecret()).update(`${id}|${viewer}|${exp}`).digest("hex");
}

/** A link valid for a few minutes, only for the signed-in viewer it was issued to. */
export async function link(docId: number, viewerId: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
  return `/abroad/doc/${docId}?exp=${exp}&sig=${await sign(docId, viewerId, exp)}`;
}

export async function validLink(docId: number, viewerId: number, exp: number, sig: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  if (!(exp >= now && exp <= now + LINK_TTL + 5)) return false;
  const want = Buffer.from(await sign(docId, viewerId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

