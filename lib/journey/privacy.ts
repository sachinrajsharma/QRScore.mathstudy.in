import { all, run } from "../portal/db";
import * as storage from "../market/storage";

/** The student's own copy of their journey data, and erasure. Staff-only notes and the communication log are not part of the student's export. */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function exportJourney(uid: number): Promise<Record<string, unknown> | null> {
  const [c] = await all<R>("SELECT * FROM oj_cases WHERE user_id = $1", [uid]);
  if (!c) return null;
  const id = Number(c.id);
  return {
    case: { destination: c.destination, degree: c.degree, intake: c.intake, status: c.status, started_at: c.started_at, template: `${c.template_key} v${c.template_version}`, answers: JSON.parse(c.profile_json) },
    applications: (await all<R>("SELECT uni_name, programme, intake, category, status, offer_type, offer_conditions, offer_deadline, closed_reason FROM oj_applications WHERE case_id = $1", [id])),
    tasks: (await all<R>("SELECT stage, title, status, owner_role, priority, due_at, completed_at, na_reason FROM oj_tasks WHERE case_id = $1 AND obsolete = 0 ORDER BY stage, id", [id])),
    documents: (await all<R>("SELECT doc_key, version, original_name, size, status, reject_reason, expires_on, created_at FROM oj_documents WHERE case_id = $1 ORDER BY doc_key, version", [id])),
    history: (await all<R>("SELECT kind, from_status, to_status, note, created_at FROM oj_events WHERE case_id = $1 AND kind IN ('status','doc.uploaded','doc.verified','doc.rejected','application.added','application.status','exception.applied','case.created') ORDER BY id", [id])),
    exceptions: (await all<R>("SELECT kind, status, reason, created_at FROM oj_exceptions WHERE case_id = $1", [id])),
    notifications: (await all<R>("SELECT kind, title, created_at FROM oj_notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 200", [uid])),
  };
}

/** Delete the journey, its files and notifications. Foreign keys remove tasks, evidence, events and applications with the case. */
export async function eraseJourney(uid: number): Promise<number> {
  const docs = await all<R>("SELECT d.stored_name FROM oj_documents d JOIN oj_cases c ON c.id = d.case_id WHERE c.user_id = $1", [uid]);
  for (const d of docs) await storage.remove("vault", String(d.stored_name).replace(/^.*[\/]/, ""));
  await run("DELETE FROM oj_cases WHERE user_id = $1", [uid]);
  await run("DELETE FROM oj_notifications WHERE user_id = $1", [uid]);
  await run("DELETE FROM oj_notif_prefs WHERE user_id = $1", [uid]);
  return docs.length;
}
