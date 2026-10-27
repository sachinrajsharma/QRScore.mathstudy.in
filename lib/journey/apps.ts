import { all, one, run, tx, val } from "../portal/db";
import * as N from "./notify";
import { actorFor, closeAsNa, type Who } from "./service";
import { generateAppTasks, getCase, logEvent, mapApp, type AppRow } from "./store";

/**
 * University applications inside a case. One application per university + programme + intake: the database refuses a duplicate, and each
 * application has its own tasks, documents and status, so withdrawing or rejecting one never changes another.
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const norm = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 160);
export const CATEGORIES = ["ambitious", "target", "safer"] as const;

export interface AppInput { universityId?: number | null; uniName?: string; programme: string; intake: string; category: string }

export async function addApplication(caseId: number, who: Who, input: AppInput): Promise<number | string> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor) return "Case not found.";
  if (c.status === "withdrawn") return "This journey was withdrawn.";
  let name = (input.uniName ?? "").trim();
  let universityId: number | null = null;
  if (input.universityId) {
    const u = await one<R>("SELECT id, name FROM sa_universities WHERE id = $1", [input.universityId]);
    if (!u) return "University not found.";
    universityId = Number(u.id);
    name = String(u.name);
  }
  const programme = input.programme.trim();
  const intake = (input.intake || c.intake).trim();
  if (name.length < 2) return "Enter the university name.";
  if (programme.length < 3) return "Enter the programme (course) name.";
  if (!intake) return "Choose the intake.";
  if (!(CATEGORIES as readonly string[]).includes(input.category)) return "Choose ambitious, target or safer.";
  if ((await val("SELECT id FROM oj_applications WHERE case_id = $1 AND uni_key = $2 AND prog_key = $3 AND intake_key = $4", [caseId, norm(name), norm(programme), norm(intake)])) !== null) return "You already have an application for this university, programme and intake.";
  try {
    const id = await tx(async (t) => {
      const r = await t.query<R>(
        "INSERT INTO oj_applications (case_id, university_id, uni_name, programme, intake, uni_key, prog_key, intake_key, category, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'shortlisted',NOW(),NOW()) RETURNING id",
        [caseId, universityId, name.slice(0, 160), programme.slice(0, 160), intake.slice(0, 30), norm(name), norm(programme), norm(intake), input.category],
      );
      const appId = Number(r.rows[0].id);
      const n = await generateAppTasks(t, c, appId);
      await logEvent({ caseId, applicationId: appId, actorId: actor.id, actorRole: actor.role, kind: "application.added", note: `${name} — ${programme} (${intake}, ${input.category})`, meta: { tasks: n } }, t);
      return appId;
    });
    if (actor.role === "student" && c.consultantId) await N.notify({ userId: c.consultantId, caseId, kind: "application_added", title: `New shortlist entry: ${name}`, body: `${programme}, ${intake}`, link: `/counselor/journey/${caseId}`, dedupe: `appadd:${id}`, email: false });
    return id;
  } catch (e) {
    if (/Duplicate entry/i.test((e as Error).message)) return "You already have an application for this university, programme and intake.";
    throw e;
  }
}

export async function applications(caseId: number): Promise<AppRow[]> {
  return (await all<R>("SELECT * FROM oj_applications WHERE case_id = $1 ORDER BY id", [caseId])).map(mapApp);
}

/** Per-application progress from its tasks. */
export async function appProgress(caseId: number): Promise<Map<number, { total: number; done: number; open: number; overdue: number }>> {
  const rows = await all<R>(
    `SELECT application_id AS a, COUNT(*) AS total, SUM(status = 'completed') AS done, SUM(status NOT IN ('completed','not_applicable')) AS open_n, SUM(status NOT IN ('completed','not_applicable') AND due_at < NOW()) AS late
       FROM oj_tasks WHERE case_id = $1 AND application_id IS NOT NULL AND obsolete = 0 AND status <> 'not_applicable' GROUP BY application_id`, [caseId]);
  return new Map(rows.map((r) => [Number(r.a), { total: Number(r.total), done: Number(r.done), open: Number(r.open_n), overdue: Number(r.late) }]));
}

/** Staff correct the details recorded about an offer or the application (never the status, which only follows verified task completion or an exception). */
export async function updateTerms(appId: number, who: Who, f: { tuitionNote?: string; scholarshipNote?: string; depositAmount?: string; offerDeadline?: string }): Promise<string | null> {
  const a = await one<R>("SELECT * FROM oj_applications WHERE id = $1", [appId]);
  const c = a ? await getCase(Number(a.case_id)) : null;
  const actor = c ? actorFor(who, c) : null;
  if (!a || !c || !actor || actor.role === "student") return "Application not found.";
  const d = f.offerDeadline ? (/^\d{4}-\d{2}-\d{2}$/.test(f.offerDeadline) ? f.offerDeadline : null) : null;
  if (f.offerDeadline && !d) return "Enter the deadline as a valid date.";
  await run("UPDATE oj_applications SET tuition_note = $1, scholarship_note = $2, deposit_amount = $3, offer_deadline = COALESCE($4, offer_deadline), updated_at = NOW() WHERE id = $5", [(f.tuitionNote ?? a.tuition_note).slice(0, 120), (f.scholarshipNote ?? a.scholarship_note).slice(0, 120), (f.depositAmount ?? a.deposit_amount).slice(0, 40), d, appId]);
  await logEvent({ caseId: c.id, applicationId: appId, actorId: actor.id, actorRole: actor.role, kind: "application.terms", note: "Offer details updated" });
  return null;
}

export { closeAsNa };
