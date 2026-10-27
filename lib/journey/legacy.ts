import { all, one, run, val } from "../portal/db";
import * as storage from "../market/storage";
import { randomBytes } from "node:crypto";
import { norm } from "./apps";
import { actorFor, reconcile, type Who } from "./service";
import { addEvidence, createCase, getCase, loadCase, logEvent, type CaseInput } from "./store";
import { isRestricted } from "./types";

/**
 * Bridge from the original seven-card tracker (Profile, Documents, Review, Applied, Offer, Visa, Arrived) to the journey.
 *
 *   Profile  -> stages 1-3   Documents -> stage 4   Review -> stage 5   Applied -> stages 6-7
 *   Offer    -> stages 8-9   Visa      -> stages 10-11   Arrived -> stage 12 (tracks 13-14 are extra)
 *
 * Importing copies what exists (applications, documents) and never marks a task done by itself: only the automatic checks that prove a fact
 * (email confirmed, profile saved with consent, documents verified) complete tasks. Earlier steps a student really finished can be carried over
 * by a consultant with a written confirmation (carryOver), which is logged as that person's statement.
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const LEGACY_CARDS: Array<{ key: string; name: string; stages: number[] }> = [
  { key: "ONBOARDING", name: "Profile", stages: [1, 2, 3] }, { key: "DOC_COLLECTION", name: "Documents", stages: [4] }, { key: "IN_REVIEW", name: "Review", stages: [5] },
  { key: "APPLIED", name: "Applied", stages: [6, 7] }, { key: "OFFER_RECEIVED", name: "Offer", stages: [8, 9] }, { key: "VISA_PREP", name: "Visa", stages: [10, 11] }, { key: "ALUMNI", name: "Arrived", stages: [12] },
];

/** The seven original cards, computed from the new stages' progress. A card is "done" at 100%, "current" for the first unfinished one. */
export function legacyCards(stages: Array<{ stage: number; total: number; done: number }>): Array<{ key: string; name: string; pct: number; state: "done" | "current" | "todo" }> {
  let currentSeen = false;
  return LEGACY_CARDS.map((c) => {
    const xs = stages.filter((s) => c.stages.includes(s.stage));
    const total = xs.reduce((a, s) => a + s.total, 0);
    const done = xs.reduce((a, s) => a + s.done, 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const finished = total > 0 && done === total;
    const state = finished ? "done" : !currentSeen ? "current" : "todo";
    if (!finished) currentSeen = true;
    return { key: c.key, name: c.name, pct, state };
  });
}

/** Suggested answers for the setup form, from the student's existing study-abroad profile. */
export async function prefill(userId: number): Promise<Partial<CaseInput> & { hasLegacy: boolean }> {
  const p = await one<R>("SELECT level, countries, intake, english_test FROM sa_profiles WHERE user_id = $1", [userId]);
  if (!p) return { hasLegacy: false };
  const first = String(p.countries ?? "").split(",").filter(Boolean)[0];
  return { hasLegacy: true, destination: first || undefined, degree: p.level === "UG" ? "UG" : "PG", intake: String(p.intake || ""), englishExempt: false };
}

const DOC_MAP: Record<string, string> = { passport: "passport", transcripts: "transcripts", sop: "sop", lor: "lor", english: "english_scorecard", financial: "financial", cv: "cv", other: "other" };
const APP_STATUS: Record<string, string> = { draft: "preparing", in_review: "preparing", applied: "submitted", offer: "offer", declined: "declined", accepted: "accepted" };

/** Start the journey for a student, importing any existing applications and documents. */
export async function startJourney(userId: number, input: CaseInput, actor: { id: number; role: "student" | "counselor" | "admin" }): Promise<number> {
  const caseId = await createCase(userId, input, actor);
  const imported = await importLegacy(caseId, userId);
  await reconcile(caseId);
  if (imported.apps || imported.docs) await logEvent({ caseId, actorId: actor.id, actorRole: actor.role, kind: "legacy.imported", note: `Imported ${imported.apps} application(s) and ${imported.docs} document(s) from the earlier tracker` });
  return caseId;
}

export async function importLegacy(caseId: number, userId: number): Promise<{ apps: number; docs: number }> {
  const c = await getCase(caseId);
  if (!c) return { apps: 0, docs: 0 };
  let apps = 0;
  let docs = 0;
  const { addApplication } = await import("./apps");
  const legacyApps = await all<R>("SELECT a.*, u.name AS uni_name, u.band FROM sa_applications a JOIN sa_universities u ON u.id = a.university_id WHERE a.user_id = $1 ORDER BY a.id", [userId]);
  for (const a of legacyApps) {
    const band = Number(a.band);
    const id = await addApplication(caseId, { id: userId, role: "student" }, { universityId: Number(a.university_id), programme: a.program || "Programme to confirm", intake: a.intake || c.intake || "Not sure yet", category: band >= 4 ? "ambitious" : band <= 2 ? "safer" : "target" });
    if (typeof id === "number") {
      apps += 1;
      const st = APP_STATUS[String(a.status)] ?? "preparing";
      await run("UPDATE oj_applications SET status = $1, offer_type = $2, offer_conditions = $3, legacy_application_id = $4 WHERE id = $5", [st, a.offer_type || "", String(a.offer_note || "").slice(0, 1000), Number(a.id), id]);
    }
  }
  const legacyDocs = await all<R>("SELECT * FROM sa_documents WHERE user_id = $1 ORDER BY created_at, id", [userId]);
  for (const d of legacyDocs) {
    const key = DOC_MAP[String(d.doc_type)] ?? "other";
    const bytes = await storage.get("vault", String(d.stored_name).replace(/^.*[\\/]/, ""));
    if (!bytes) continue;
    const stored = randomBytes(20).toString("hex") + "." + (String(d.stored_name).split(".").pop() ?? "bin");
    if (!(await storage.put("vault", stored, bytes, d.mime))) continue;
    const v = Number(await val("SELECT COALESCE(MAX(version),0)+1 FROM oj_documents WHERE case_id = $1 AND doc_key = $2 AND app_key = 0", [caseId, key]) ?? 1);
    await run("UPDATE oj_documents SET status = 'superseded' WHERE case_id = $1 AND doc_key = $2 AND app_key = 0", [caseId, key]);
    const status = ["uploaded", "verified", "rejected"].includes(String(d.status)) ? d.status : "uploaded";
    const id = Number(await val("INSERT INTO oj_documents (case_id, doc_key, app_key, application_id, version, original_name, stored_name, mime, size, status, reject_reason, restricted, uploaded_by, reviewed_by, reviewed_at, created_at) VALUES ($1,$2,0,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
      [caseId, key, v, d.original_name, stored, d.mime, d.size, status, d.reject_reason || "", isRestricted(key) ? 1 : 0, userId, d.verified_by ?? null, d.verified_at ?? null, d.created_at]));
    // Attach to open tasks asking for this type so the evidence is visible on them.
    const tasks = await all<R>("SELECT id, evidence_json FROM oj_tasks WHERE case_id = $1 AND application_id IS NULL AND status NOT IN ('completed','not_applicable')", [caseId]);
    for (const t of tasks) if (key !== "other" && (JSON.parse(t.evidence_json) as Array<{ kind: string; docKey?: string }>).some((e) => e.kind === "document" && e.docKey === key)) await addEvidence({ taskId: Number(t.id), caseId, kind: "document", docId: id, docKey: key, byRole: "student", byUser: userId });
    docs += 1;
  }
  await run("UPDATE oj_cases SET imported_from_legacy = 1 WHERE id = $1", [caseId]);
  void norm;
  return { apps, docs };
}

/** A consultant (or admin) confirms that a student already finished everything up to a stage in the earlier tracker. Each task is completed with that person's written confirmation. */
export async function carryOver(caseId: number, who: Who, upToStage: number, noteIn: string): Promise<{ error: string } | { completed: number }> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor || actor.role === "student") return { error: "Case not found." };
  if (!c.legacy) return { error: "Only journeys imported from the earlier tracker can carry steps over." };
  const note = noteIn.trim();
  if (note.length < 10) return { error: "Write what you checked (for example, which documents you saw)." };
  if (upToStage < 1 || upToStage > 12) return { error: "Choose a stage between 1 and 12." };
  const loaded = await loadCase(caseId);
  if (!loaded) return { error: "Case not found." };
  let n = 0;
  for (const t of loaded.tasks) {
    if (t.obsolete || t.stage > upToStage || ["completed", "not_applicable"].includes(t.status) || t.auto) continue;
    const ok = await run("UPDATE oj_tasks SET status = 'completed', completed_at = NOW(), started_at = COALESCE(started_at, NOW()), completed_by = $1, updated_at = NOW() WHERE id = $2 AND status NOT IN ('completed','not_applicable')", [actor.id, t.id]);
    if (!ok) continue;
    await addEvidence({ taskId: t.id, caseId, kind: "confirmation", text: `Carried over from the earlier tracker: ${note}`, byRole: actor.role, byUser: actor.id });
    await logEvent({ caseId, taskId: t.id, applicationId: t.applicationId, actorId: actor.id, actorRole: actor.role, kind: "status", from: t.status, to: "completed", note: `Carried over from the earlier tracker: ${note}` });
    n += 1;
  }
  await logEvent({ caseId, actorId: actor.id, actorRole: actor.role, kind: "legacy.carryover", note: `Stages 1-${upToStage}: ${note}`, meta: { completed: n } });
  await reconcile(caseId);
  return { completed: n };
}
