import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { all, one, run, tx, val } from "../portal/db";
import { appSecret } from "../portal/crypto";
import * as storage from "../market/storage";
import { ALLOWED, MAX_BYTES, sniff } from "../abroad/vault";
import * as scanner from "../abroad/scanner";
import * as N from "./notify";
import { addEvidence, getCase, loadCase, logEvent } from "./store";
import { actorFor, reconcile, type Who } from "./service";
import { DOC_KEYS, isRestricted } from "./types";

/**
 * Versioned journey documents. Uploading again never overwrites: it creates version n+1 and marks the previous one superseded. Files sit in the
 * private "vault" bucket under random names and are only served through a signed, short-lived, viewer-bound link. Passports and financial
 * documents are "restricted": only the student, the assigned consultant and administrators can open them, and every open is logged.
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const MAX_VERSIONS = 20;
const LINK_TTL = 300;

export interface JDoc { id: number; caseId: number; docKey: string; applicationId: number | null; version: number; name: string; size: number; status: string; rejectReason: string; expiresOn: string | null; restricted: boolean; uploadedBy: number; reviewedBy: number | null; createdAt: string }
const map = (r: R): JDoc => ({ id: Number(r.id), caseId: Number(r.case_id), docKey: r.doc_key, applicationId: r.application_id === null ? null : Number(r.application_id), version: Number(r.version), name: r.original_name, size: Number(r.size), status: r.status, rejectReason: r.reject_reason, expiresOn: r.expires_on ? String(r.expires_on).slice(0, 10) : null, restricted: Number(r.restricted) === 1, uploadedBy: Number(r.uploaded_by), reviewedBy: r.reviewed_by === null ? null : Number(r.reviewed_by), createdAt: String(r.created_at) });

export async function listDocs(caseId: number, opts: { latestOnly?: boolean } = {}): Promise<JDoc[]> {
  const rows = await all<R>(`SELECT * FROM oj_documents d WHERE case_id = $1 ${opts.latestOnly ? "AND version = (SELECT MAX(version) FROM oj_documents x WHERE x.case_id = d.case_id AND x.doc_key = d.doc_key AND x.app_key = d.app_key)" : ""} ORDER BY doc_key, app_key, version DESC`, [caseId]);
  return rows.map(map);
}
export async function findDoc(id: number): Promise<JDoc | null> {
  const r = await one<R>("SELECT * FROM oj_documents WHERE id = $1", [id]);
  return r ? map(r) : null;
}

export async function upload(caseId: number, who: Who, input: { docKey: string; applicationId?: number | null; expiresOn?: string; taskId?: number | null }, file: { name: string; size: number; bytes: Uint8Array }): Promise<number | string> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor) return "Case not found.";
  if (c.status === "withdrawn") return "This journey was withdrawn.";
  if (!DOC_KEYS[input.docKey]) return "Choose a document type.";
  const appId = input.applicationId ?? null;
  if (appId !== null && (await val("SELECT id FROM oj_applications WHERE id = $1 AND case_id = $2", [appId, caseId])) === null) return "That application is not part of this journey.";
  if (file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_BYTES) return "That file is too large (maximum 8 MB).";
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = ALLOWED[ext] ? sniff(file.bytes, ext) : null;
  if (!mime) return "Upload a PDF, JPG, PNG or DOCX file.";
  let expires: string | null = null;
  if (input.expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || Number.isNaN(Date.parse(input.expiresOn))) return "Enter the expiry date as a valid date.";
    expires = input.expiresOn;
  }
  const appKey = appId ?? 0;
  if (Number(await val("SELECT COUNT(*) FROM oj_documents WHERE case_id = $1 AND doc_key = $2 AND app_key = $3", [caseId, input.docKey, appKey]) ?? 0) >= MAX_VERSIONS) return "Too many versions of this document. Ask your consultant to archive older ones.";
  const [scan, note] = await scanner.scan(file.bytes, ext);
  if (scan !== "clean") {
    await logEvent({ caseId, actorId: actor.id, actorRole: actor.role, kind: "doc.blocked", note: `${input.docKey}: ${note}` });
    return `That file did not pass our security check: ${note}.`;
  }
  const stored = randomBytes(20).toString("hex") + "." + ext;
  if (!(await storage.put("vault", stored, file.bytes, mime))) return "We could not save that file. Please try again.";
  const name = file.name.replace(/[^\p{L}\p{N}_ .\-()]+/gu, "_").slice(0, 160);
  const id = await tx(async (t) => {
    const v = Number((await t.query<R>("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM oj_documents WHERE case_id = $1 AND doc_key = $2 AND app_key = $3 FOR UPDATE", [caseId, input.docKey, appKey])).rows[0].v);
    await t.query("UPDATE oj_documents SET status = 'superseded' WHERE case_id = $1 AND doc_key = $2 AND app_key = $3 AND status <> 'superseded'", [caseId, input.docKey, appKey]);
    const r = await t.query<R>(
      "INSERT INTO oj_documents (case_id, doc_key, app_key, application_id, version, original_name, stored_name, mime, size, status, expires_on, restricted, uploaded_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'uploaded',$10,$11,$12,NOW()) RETURNING id",
      [caseId, input.docKey, appKey, appId, v, name, stored, mime, file.size, expires, isRestricted(input.docKey) ? 1 : 0, actor.id],
    );
    const docId = Number(r.rows[0].id);
    await logEvent({ caseId, applicationId: appId, actorId: actor.id, actorRole: actor.role, kind: "doc.uploaded", note: `${DOC_KEYS[input.docKey].label} v${v}`, meta: { docId, version: v } }, t);
    // Attach to the task it was uploaded for, and to other open tasks of this case that ask for exactly this kind of document (never the catch-all "other").
    const open = (await t.query<R>("SELECT id, application_id, evidence_json, status, owner_role FROM oj_tasks WHERE case_id = $1 AND obsolete = 0 AND status NOT IN ('completed','not_applicable') AND (application_id <=> $2)", [caseId, appId])).rows;
    for (const tk of open) {
      const wants = (JSON.parse(tk.evidence_json) as Array<{ kind: string; docKey?: string }>).some((e) => e.kind === "document" && e.docKey === input.docKey);
      const explicit = input.taskId !== undefined && input.taskId !== null && Number(tk.id) === input.taskId;
      if (!wants || (!explicit && input.docKey === "other")) continue;
      if (actor.role === "student" && tk.owner_role !== "student" && !explicit) continue;
      await addEvidence({ taskId: Number(tk.id), caseId, kind: "document", docId, docKey: input.docKey, byRole: actor.role, byUser: actor.id }, t);
    }
    return docId;
  });
  if (c.consultantId && actor.role === "student") await N.notify({ userId: c.consultantId, caseId, kind: "doc_uploaded", title: `New document to check: ${DOC_KEYS[input.docKey].label}`, body: "A student uploaded a document.", link: `/counselor/journey/${caseId}`, dedupe: `docup:${id}`, email: false });
  await reconcile(caseId);
  return id;
}

/** Staff verify or reject the newest version of a document. Rejection needs a reason, which the student sees. */
export async function review(docId: number, who: Who, ok: boolean, reasonIn: string): Promise<string | null> {
  const d = await findDoc(docId);
  const c = d ? await getCase(d.caseId) : null;
  const actor = c ? actorFor(who, c) : null;
  if (!d || !c || !actor || actor.role === "student") return "Document not found.";
  const newest = Number(await val("SELECT MAX(version) FROM oj_documents WHERE case_id = $1 AND doc_key = $2 AND app_key = $3", [d.caseId, d.docKey, d.applicationId ?? 0]) ?? 0);
  if (d.version !== newest) return "A newer version has been uploaded. Review that one.";
  if (!["uploaded", "rejected", "verified"].includes(d.status)) return "This document cannot be reviewed (it is expired or superseded).";
  const reason = reasonIn.trim();
  if (!ok && reason.length < 5) return "Tell the student what is wrong, so they can fix it.";
  await run("UPDATE oj_documents SET status = $1, reject_reason = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4", [ok ? "verified" : "rejected", ok ? "" : reason.slice(0, 255), actor.id, docId]);
  await logEvent({ caseId: d.caseId, applicationId: d.applicationId, actorId: actor.id, actorRole: actor.role, kind: ok ? "doc.verified" : "doc.rejected", note: `${DOC_KEYS[d.docKey]?.label} v${d.version}${ok ? "" : ": " + reason}`, meta: { docId } });
  await N.notify({ userId: c.userId, caseId: c.id, kind: ok ? "doc_ok" : "doc_bad", title: ok ? `Document verified: ${DOC_KEYS[d.docKey]?.label}` : `Document needs a new version: ${DOC_KEYS[d.docKey]?.label}`, body: ok ? "Your consultant verified this document." : `Reason: ${reason}. Upload a new version.`, link: "/abroad/journey/documents", dedupe: `docrev:${docId}:${ok ? "ok" : "bad"}:${Date.now()}` });
  await reconcile(d.caseId);
  return null;
}

// ---- access: signed links, role rules, access log ----------------------------------------------------------------------------------------------

async function sign(id: number, viewer: number, exp: number): Promise<string> {
  return createHmac("sha256", await appSecret()).update(`oj|${id}|${viewer}|${exp}`).digest("hex");
}

/** May this person open the file? The student who owns it, the assigned consultant, and administrators: nobody else, restricted or not. */
export async function canOpen(docId: number, who: Who): Promise<JDoc | null> {
  const d = await findDoc(docId);
  const c = d ? await getCase(d.caseId) : null;
  if (!d || !c || !actorFor(who, c)) return null;
  return d;
}

export async function link(docId: number, who: Who): Promise<string | null> {
  if (!(await canOpen(docId, who))) return null;
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
  return `/abroad/journey/doc/${docId}?exp=${exp}&sig=${await sign(docId, who.id, exp)}`;
}

export async function validLink(docId: number, viewer: number, exp: number, sig: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  if (!(exp >= now && exp <= now + LINK_TTL + 5)) return false;
  const want = Buffer.from(await sign(docId, viewer, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Read the bytes for a verified link and record the access. */
export async function openFile(docId: number, who: Who): Promise<{ bytes: Buffer; mime: string; name: string } | null> {
  const d = await canOpen(docId, who);
  if (!d) return null;
  const r = await one<R>("SELECT stored_name, mime FROM oj_documents WHERE id = $1", [docId]);
  const bytes = r ? await storage.get("vault", String(r.stored_name)) : null;
  if (!r || !bytes) return null;
  await run("INSERT INTO oj_doc_access (doc_id, case_id, viewer_id, viewer_role, created_at) VALUES ($1,$2,$3,$4,NOW())", [docId, d.caseId, who.id, who.role]);
  return { bytes, mime: String(r.mime), name: d.name };
}

export async function accessLog(caseId: number, limit = 20): Promise<R[]> {
  return all(`SELECT a.*, u.name AS viewer FROM oj_doc_access a LEFT JOIN users u ON u.id = a.viewer_id WHERE a.case_id = $1 ORDER BY a.id DESC LIMIT ${Math.trunc(limit)}`, [caseId]);
}

/** Documents the student still owes: required types with no usable (uploaded/verified, unexpired) newest version. */
export async function missingCore(caseId: number): Promise<string[]> {
  const docs = await listDocs(caseId, { latestOnly: true });
  return ["passport", "transcripts", "cv"].filter((k) => !docs.some((d) => d.docKey === k && !d.applicationId && ["uploaded", "verified"].includes(d.status)));
}

export { loadCase };
