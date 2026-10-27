import { all, one, run, tx, val } from "../portal/db";
import * as N from "./notify";
import { actorFor, buildView, type Who } from "./service";
import { getCase, loadCase, logEvent, packageLevel } from "./store";
import { parseIntake } from "./engine";

/** The consultant workspace: caseload with filters, assignment and handover history, communication log, reminders, deadlines, risk alerts and export. */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const isStaff = (w: Who) => w.role === "counselor" || w.role === "admin";

// ---- assignment ---------------------------------------------------------------------------------------------------------------------

export async function consultants(): Promise<Array<{ id: number; name: string; email: string; cases: number }>> {
  return all("SELECT u.id, u.name, u.email, (SELECT COUNT(*) FROM oj_cases c WHERE c.consultant_id = u.id AND c.status IN ('active','deferred')) AS cases FROM users u WHERE u.role = 'counselor' ORDER BY u.name");
}

/** Assign or reassign a case. Admins may assign anyone; a counselor may hand their own case to another counselor. The reason is kept in the handover history. */
export async function assign(caseId: number, to: number | null, who: Who, reasonIn: string): Promise<string | null> {
  if (!isStaff(who)) return "Not allowed.";
  const c = await getCase(caseId);
  if (!c) return "Case not found.";
  if (who.role === "counselor" && c.consultantId !== who.id) return "Only the assigned consultant or an administrator can hand a case over.";
  const reason = reasonIn.trim();
  if (reason.length < 5) return "Give a short reason for the handover.";
  if (to !== null && (await val("SELECT id FROM users WHERE id = $1 AND role = 'counselor'", [to])) === null) return "Choose a valid consultant.";
  if (to === c.consultantId) return "That consultant already has this case.";
  await tx(async (t) => {
    await t.query("UPDATE oj_cases SET consultant_id = $1, updated_at = NOW() WHERE id = $2", [to, caseId]);
    await t.query("UPDATE oj_tasks SET owner_user_id = $1 WHERE case_id = $2 AND owner_role = 'consultant' AND status NOT IN ('completed','not_applicable')", [to, caseId]);
    await t.query("UPDATE sa_profiles SET counselor_id = $1 WHERE user_id = $2", [to, c.userId]);
    await t.query("INSERT INTO oj_handovers (case_id, from_consultant, to_consultant, by_user, reason, created_at) VALUES ($1,$2,$3,$4,$5,NOW())", [caseId, c.consultantId, to, who.id, reason.slice(0, 500)]);
    await logEvent({ caseId, actorId: who.id, actorRole: who.role, kind: "case.assigned", note: reason, meta: { from: c.consultantId, to } }, t);
  });
  if (to) {
    await N.notify({ userId: to, caseId, kind: "assigned", title: "A student was assigned to you", body: reason, link: `/counselor/journey/${caseId}`, dedupe: `assign:${caseId}:${to}:${Date.now()}` });
    const name = String(await val("SELECT name FROM users WHERE id = $1", [to]));
    await N.notify({ userId: c.userId, caseId, kind: "assigned", title: `Your consultant is now ${name}`, body: "They will review your documents and tasks.", link: "/abroad/journey", dedupe: `assign-s:${caseId}:${to}:${Date.now()}` });
  }
  return null;
}

/** A counselor takes an unassigned case. Atomic: two counselors cannot both claim it. */
export async function claim(caseId: number, who: Who): Promise<string | null> {
  if (who.role !== "counselor") return "Only counselors take students; administrators assign them.";
  const n = await run("UPDATE oj_cases SET consultant_id = $1, updated_at = NOW() WHERE id = $2 AND consultant_id IS NULL", [who.id, caseId]);
  if (!n) return "That student already has a consultant.";
  const c = await getCase(caseId);
  await run("UPDATE oj_tasks SET owner_user_id = $1 WHERE case_id = $2 AND owner_role = 'consultant' AND status NOT IN ('completed','not_applicable')", [who.id, caseId]);
  await run("UPDATE sa_profiles SET counselor_id = $1 WHERE user_id = $2", [who.id, c?.userId]);
  await run("INSERT INTO oj_handovers (case_id, from_consultant, to_consultant, by_user, reason, created_at) VALUES ($1,NULL,$2,$2,'Claimed from the waiting list',NOW())", [caseId, who.id]);
  await logEvent({ caseId, actorId: who.id, actorRole: who.role, kind: "case.assigned", note: "Claimed from the waiting list", meta: { to: who.id } });
  if (c) await N.notify({ userId: c.userId, caseId, kind: "assigned", title: "You have a study-abroad consultant", body: "They will review your documents and tasks.", link: "/abroad/journey", dedupe: `assign-s:${caseId}:${who.id}:${Date.now()}` });
  return null;
}

export async function handovers(caseId: number): Promise<R[]> {
  return all("SELECT h.*, f.name AS from_name, t.name AS to_name, b.name AS by_name FROM oj_handovers h LEFT JOIN users f ON f.id = h.from_consultant LEFT JOIN users t ON t.id = h.to_consultant LEFT JOIN users b ON b.id = h.by_user WHERE h.case_id = $1 ORDER BY h.id DESC", [caseId]);
}

// ---- communication log and reminders ---------------------------------------------------------------------------------------------------

export const CHANNELS = ["note", "call", "email", "meeting", "message"] as const;
export const DIRECTIONS = ["internal", "student", "university"] as const;

export async function logComm(caseId: number, who: Who, f: { channel: string; direction: string; subject: string; body: string; applicationId?: number | null }): Promise<string | null> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor || actor.role === "student") return "Case not found.";
  if (!(CHANNELS as readonly string[]).includes(f.channel) || !(DIRECTIONS as readonly string[]).includes(f.direction)) return "Choose a channel and who it was with.";
  const body = f.body.trim();
  if (body.length < 3) return "Write what was said or agreed.";
  if (f.applicationId && (await val("SELECT id FROM oj_applications WHERE id = $1 AND case_id = $2", [f.applicationId, caseId])) === null) return "Application not found.";
  await run("INSERT INTO oj_comm (case_id, application_id, author_id, channel, direction, subject, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())", [caseId, f.applicationId ?? null, actor.id, f.channel, f.direction, f.subject.trim().slice(0, 160), body.slice(0, 2000)]);
  await logEvent({ caseId, applicationId: f.applicationId ?? null, actorId: actor.id, actorRole: actor.role, kind: "comm.logged", note: `${f.channel} (${f.direction}): ${f.subject || body.slice(0, 80)}` });
  return null;
}

export async function commLog(caseId: number, limit = 50): Promise<R[]> {
  return all(`SELECT m.*, u.name AS author, a.uni_name FROM oj_comm m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN oj_applications a ON a.id = m.application_id WHERE m.case_id = $1 ORDER BY m.id DESC LIMIT ${Math.trunc(limit)}`, [caseId]);
}

export async function addReminder(caseId: number, who: Who, remindOn: string, body: string, taskId?: number | null): Promise<string | null> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor || actor.role === "student") return "Case not found.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(remindOn) || Number.isNaN(Date.parse(remindOn))) return "Pick a valid date.";
  if (body.trim().length < 3) return "Write what to be reminded of.";
  await run("INSERT INTO oj_reminders (case_id, task_id, for_user, remind_on, body, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())", [caseId, taskId ?? null, actor.id, remindOn, body.trim().slice(0, 300), actor.id]);
  await logEvent({ caseId, taskId: taskId ?? null, actorId: actor.id, actorRole: actor.role, kind: "reminder.set", note: `${remindOn}: ${body.trim().slice(0, 100)}` });
  return null;
}

export async function reminders(caseId: number, userId: number): Promise<R[]> {
  return all("SELECT * FROM oj_reminders WHERE case_id = $1 AND for_user = $2 ORDER BY done_at IS NOT NULL, remind_on LIMIT 20", [caseId, userId]);
}
export async function doneReminder(id: number, who: Who): Promise<void> {
  await run("UPDATE oj_reminders SET done_at = NOW() WHERE id = $1 AND for_user = $2", [id, who.id]);
}

// ---- caseload with filters -----------------------------------------------------------------------------------------------------------------

export interface Filters { country?: string; university?: string; intake?: string; consultant?: number | "none"; status?: string; urgency?: "overdue" | "due7" | "critical" | "review" | ""; q?: string }
export interface CaseRowList {
  caseId: number; studentId: number; student: string; email: string; destination: string; degree: string; intake: string; consultantId: number | null; consultant: string | null; caseStatus: string;
  total: number; done: number; pct: number; stage: number; overdue: number; criticalOverdue: number; due7: number; review: number; lastEvent: string | null; universities: string;
}

/** Cases this person may see, with progress and urgency counts. Counselors get only their assigned cases; admins everything. Filters are applied in SQL. */
export async function caseload(who: Who, f: Filters = {}, limit = 200): Promise<CaseRowList[]> {
  if (!isStaff(who)) return [];
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v?: unknown) => { if (v !== undefined) p.push(v); where.push(sql.replace("?", `$${p.length}`)); };
  if (who.role === "counselor") add("c.consultant_id = ?", who.id);
  if (f.country) add("c.destination = ?", f.country);
  if (f.intake) add("c.intake = ?", f.intake);
  if (f.consultant === "none") add("c.consultant_id IS NULL");
  else if (typeof f.consultant === "number" && f.consultant > 0) add("c.consultant_id = ?", f.consultant);
  if (f.status) add("c.status = ?", f.status);
  if (f.university) add("EXISTS (SELECT 1 FROM oj_applications a WHERE a.case_id = c.id AND a.uni_name LIKE ?)", `%${f.university.replace(/[%_]/g, "")}%`);
  if (f.q) add("(u.name LIKE ? OR u.email LIKE ?)", `%${f.q.replace(/[%_]/g, "")}%`);
  const rows = await all<R>(
    `SELECT * FROM (SELECT c.id, c.user_id, u.name, u.email, c.destination, c.degree, c.intake, c.consultant_id, k.name AS consultant, c.status AS case_status,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.status <> 'not_applicable') AS total,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.status = 'completed') AS done,
        (SELECT COALESCE(MIN(t.stage), 0) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.stage <= 12 AND t.status NOT IN ('completed','not_applicable')) AS stage,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.status NOT IN ('completed','not_applicable') AND t.due_at < UTC_TIMESTAMP()) AS overdue,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.priority = 'critical' AND t.status NOT IN ('completed','not_applicable') AND t.due_at < UTC_TIMESTAMP()) AS crit,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.status NOT IN ('completed','not_applicable') AND t.due_at >= UTC_TIMESTAMP() AND t.due_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS due7,
        (SELECT COUNT(*) FROM oj_tasks t WHERE t.case_id = c.id AND t.obsolete = 0 AND t.status = 'submitted_for_review') AS review,
        (SELECT MAX(e.created_at) FROM oj_events e WHERE e.case_id = c.id) AS last_event,
        (SELECT GROUP_CONCAT(a.uni_name SEPARATOR ', ') FROM oj_applications a WHERE a.case_id = c.id AND a.status NOT IN ('withdrawn','rejected')) AS unis
      FROM oj_cases c JOIN users u ON u.id = c.user_id LEFT JOIN users k ON k.id = c.consultant_id ${where.length ? "WHERE " + where.join(" AND ") : ""}) x
     ${f.urgency === "overdue" ? "WHERE overdue > 0" : f.urgency === "due7" ? "WHERE due7 > 0" : f.urgency === "critical" ? "WHERE crit > 0" : f.urgency === "review" ? "WHERE review > 0" : ""}
     ORDER BY crit DESC, overdue DESC, review DESC, last_event ASC LIMIT ${Math.trunc(limit)}`, p);
  return rows.map((r) => ({
    caseId: Number(r.id), studentId: Number(r.user_id), student: r.name, email: r.email, destination: r.destination, degree: r.degree, intake: r.intake, consultantId: r.consultant_id === null ? null : Number(r.consultant_id), consultant: r.consultant ?? null, caseStatus: r.case_status,
    total: Number(r.total), done: Number(r.done), pct: Number(r.total) ? Math.round((Number(r.done) / Number(r.total)) * 100) : 0, stage: Number(r.stage), overdue: Number(r.overdue), criticalOverdue: Number(r.crit), due7: Number(r.due7), review: Number(r.review), lastEvent: r.last_event ? String(r.last_event) : null, universities: r.unis ?? "",
  }));
}

export interface Deadline { taskId: number; caseId: number; student: string; title: string; dueAt: string; days: number; priority: string; owner: string; status: string }
/** Open tasks due within N days across the cases this person may see (7/14/30 views). */
export async function deadlines(who: Who, withinDays: 7 | 14 | 30, now = new Date()): Promise<Deadline[]> {
  if (!isStaff(who)) return [];
  const rows = await all<R>(
    `SELECT t.id, t.case_id, t.title, t.due_at, t.priority, t.owner_role, t.status, u.name FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id JOIN users u ON u.id = c.user_id
      WHERE t.obsolete = 0 AND t.status NOT IN ('completed','not_applicable') AND c.status IN ('active','deferred') AND t.due_at IS NOT NULL AND t.due_at < DATE_ADD($1, INTERVAL ${withinDays} DAY) ${who.role === "counselor" ? "AND c.consultant_id = $2" : ""}
      ORDER BY t.due_at ASC LIMIT 300`, who.role === "counselor" ? [now.toISOString().slice(0, 19).replace("T", " "), who.id] : [now.toISOString().slice(0, 19).replace("T", " ")]);
  return rows.map((r) => ({ taskId: Number(r.id), caseId: Number(r.case_id), student: r.name, title: r.title, dueAt: String(r.due_at), days: Math.ceil((new Date(String(r.due_at).replace(" ", "T") + "Z").getTime() - now.getTime()) / 86_400_000), priority: r.priority, owner: r.owner_role, status: r.status }));
}

export interface RiskAlert { caseId: number; student: string; level: "watch" | "high"; reasons: string[]; pct: number; intake: string; destination: string }
/** Cases at risk of missing their intake or with critical overdue work, worst first. Computed from the live tasks, not stored. */
export async function riskAlerts(who: Who, now = new Date(), limit = 25): Promise<RiskAlert[]> {
  const list = await caseload(who, { status: "active" }, 150);
  const out: RiskAlert[] = [];
  for (const row of list) {
    const loaded = await loadCase(row.caseId);
    if (!loaded) continue;
    const view = buildView(loaded, await packageLevel(loaded.c.userId), now);
    if (view.risk.level !== "none") out.push({ caseId: row.caseId, student: row.student, level: view.risk.level, reasons: view.risk.reasons, pct: view.progress.pct, intake: row.intake, destination: row.destination });
  }
  return out.sort((a, b) => Number(b.level === "high") - Number(a.level === "high") || a.pct - b.pct).slice(0, limit);
}

/** Cases waiting for a consultant. */
export async function unassignedCases(limit = 30): Promise<R[]> {
  return all(`SELECT c.id, u.name, c.destination, c.intake, c.created_at FROM oj_cases c JOIN users u ON u.id = c.user_id WHERE c.consultant_id IS NULL AND c.status IN ('active','deferred') ORDER BY c.created_at ASC LIMIT ${Math.trunc(limit)}`);
}

/** CSV for export: names and progress only, never document content. Cells that could be read as spreadsheet formulas are neutralised. */
export function toCsv(rows: CaseRowList[]): string {
  const cell = (v: unknown): string => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Student", "Email", "Destination", "Degree", "Intake", "Consultant", "Case status", "Progress %", "Current stage", "Overdue tasks", "Critical overdue", "Due in 7 days", "Awaiting review", "Universities"];
  return [head, ...rows.map((r) => [r.student, r.email, r.destination, r.degree, r.intake, r.consultant ?? "Unassigned", r.caseStatus, r.pct, r.stage, r.overdue, r.criticalOverdue, r.due7, r.review, r.universities])].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}

export { one, parseIntake };
