import { all, one, run, val } from "../portal/db";
import { appUrl, send } from "../portal/mail";
import { effectiveStatus, delayParty, isOverdue, parseSql, type Actor } from "./engine";
import { loadCase, settings, type CaseRow } from "./store";
import type { Status, TaskRow } from "./types";

/**
 * In-app notifications plus email through the portal's existing mail queue. Every notification carries a dedupe key, so a reminder or an
 * escalation is created at most once per (person, key) however often the sweep runs. Preferences are respected: a person who turned a channel off
 * gets no email, and no unread in-app item. The one exception is a critical-priority overdue alert, which always shows in the app.
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Note { userId: number; caseId?: number | null; taskId?: number | null; kind: string; title: string; body?: string; link?: string; dedupe: string; email?: boolean; force?: boolean }

export async function prefs(userId: number): Promise<{ email: boolean; inapp: boolean }> {
  const r = await one<R>("SELECT email_enabled, inapp_enabled FROM oj_notif_prefs WHERE user_id = $1", [userId]);
  return r ? { email: Number(r.email_enabled) === 1, inapp: Number(r.inapp_enabled) === 1 } : { email: true, inapp: true };
}
export async function setPrefs(userId: number, email: boolean, inapp: boolean): Promise<void> {
  await run("INSERT INTO oj_notif_prefs (user_id, email_enabled, inapp_enabled) VALUES ($1,$2,$3) ON DUPLICATE KEY UPDATE email_enabled = VALUES(email_enabled), inapp_enabled = VALUES(inapp_enabled)", [userId, email ? 1 : 0, inapp ? 1 : 0]);
}

/** Returns true when a new notification was created (false = it already existed). */
export async function notify(n: Note): Promise<boolean> {
  const p = await prefs(n.userId);
  const hidden = !p.inapp && !n.force;
  const made = await run(
    "INSERT IGNORE INTO oj_notifications (user_id, case_id, task_id, kind, title, body, link, dedupe_key, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())",
    [n.userId, n.caseId ?? null, n.taskId ?? null, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 600), n.link ?? "", n.dedupe.slice(0, 120), hidden ? new Date().toISOString().slice(0, 19).replace("T", " ") : null],
  );
  if (!made) return false;
  if (n.email !== false && p.email) {
    const u = await one<R>("SELECT email, name FROM users WHERE id = $1", [n.userId]);
    if (u) {
      await send({ email: u.email, name: u.name }, n.title, "Study abroad journey", [n.body || n.title], ["Open my journey", await appUrl((n.link ?? "abroad/journey").replace(/^\//, ""))], "journey_" + n.kind);
      await run("UPDATE oj_notifications SET emailed_at = NOW() WHERE user_id = $1 AND dedupe_key = $2", [n.userId, n.dedupe.slice(0, 120)]);
    }
  }
  return true;
}

export async function list(userId: number, limit = 30): Promise<R[]> {
  return all(`SELECT * FROM oj_notifications WHERE user_id = $1 AND (read_at IS NULL OR created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)) ORDER BY id DESC LIMIT ${Math.trunc(limit)}`, [userId]);
}
export async function unreadCount(userId: number): Promise<number> {
  return Number(await val("SELECT COUNT(*) FROM oj_notifications WHERE user_id = $1 AND read_at IS NULL", [userId]) ?? 0);
}
export async function markRead(userId: number, id?: number): Promise<void> {
  if (id) await run("UPDATE oj_notifications SET read_at = NOW() WHERE user_id = $1 AND id = $2 AND read_at IS NULL", [userId, id]);
  else await run("UPDATE oj_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [userId]);
}

const taskLink = (t: TaskRow, staff: boolean): string => (staff ? `/counselor/journey/${t.caseId}#t${t.id}` : `/abroad/journey/task/${t.id}`);
const admins = async (): Promise<number[]> => (await all<R>("SELECT id FROM users WHERE role = 'admin'")).map((r) => Number(r.id));

// ---- event-driven ----------------------------------------------------------------------------------------------------------------------------------

export async function afterTaskChange(t: TaskRow, to: Status, actor: Actor, note: string, c: CaseRow): Promise<void> {
  const ts = Date.now();
  if (to === "submitted_for_review" && c.consultantId) {
    await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "review_needed", title: `Review needed: ${t.title}`, body: `A student submitted "${t.title}" for review.`, link: taskLink(t, true), dedupe: `rev:${t.id}:${ts}` });
  }
  if (actor.role !== "student" && c.userId) {
    if (to === "completed" && t.review === "consultant" && t.status === "submitted_for_review") await notify({ userId: c.userId, caseId: c.id, taskId: t.id, kind: "approved", title: `Approved: ${t.title}`, body: note ? `Your consultant approved this: ${note}` : "Your consultant approved this step.", link: taskLink(t, false), dedupe: `appr:${t.id}:${ts}` });
    if (to === "changes_requested") await notify({ userId: c.userId, caseId: c.id, taskId: t.id, kind: "changes", title: `Changes requested: ${t.title}`, body: `Your consultant asked for changes: ${note}`, link: taskLink(t, false), dedupe: `chg:${t.id}:${ts}` });
    if (to === "waiting_on_student") await notify({ userId: c.userId, caseId: c.id, taskId: t.id, kind: "waiting_student", title: `We need something from you: ${t.title}`, body: note, link: taskLink(t, false), dedupe: `ws:${t.id}:${ts}` });
  }
  // Tasks that just became ready.
  const loaded = await loadCase(c.id);
  if (loaded && to === "completed") {
    for (const x of loaded.tasks) {
      if (x.obsolete || !["not_started", "ready_to_start"].includes(x.status) || x.id === t.id) continue;
      if (!loaded.deps.some((d) => d.taskId === x.id && d.dependsOn === t.id)) continue;
      if (effectiveStatus(x, loaded.deps, loaded.byId) !== "ready_to_start") continue;
      const owner = x.owner === "student" ? c.userId : x.owner === "consultant" ? c.consultantId : null;
      if (owner) await notify({ userId: owner, caseId: c.id, taskId: x.id, kind: "ready", title: `Ready to start: ${x.title}`, body: x.criteria, link: taskLink(x, owner !== c.userId), dedupe: `ready:${x.id}`, email: false });
    }
  }
}

export async function naRequested(t: TaskRow, actor: Actor, c: CaseRow, reason: string): Promise<void> {
  const body = `"${t.title}" was marked not applicable: ${reason}`;
  if (actor.role === "student" && c.consultantId) await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "na_request", title: "Approval needed: not applicable", body, link: taskLink(t, true), dedupe: `nareq:${t.id}:${Date.now()}` });
  if (actor.role !== "student") for (const a of await admins()) if (a !== actor.id) await notify({ userId: a, caseId: c.id, taskId: t.id, kind: "na_request", title: "Approval needed: not applicable", body, link: taskLink(t, true), dedupe: `nareq:${t.id}:${Date.now()}` });
}
export async function naDecided(t: TaskRow, c: CaseRow, approved: boolean, note: string): Promise<void> {
  await notify({ userId: c.userId, caseId: c.id, taskId: t.id, kind: "na_decision", title: approved ? `Not applicable approved: ${t.title}` : `Not applicable declined: ${t.title}`, body: approved ? "This step no longer applies." : `This step still applies. ${note}`, link: taskLink(t, false), dedupe: `nadec:${t.id}:${Date.now()}`, email: false });
}

// ---- the sweep: reminders, overdue alerts, escalation -----------------------------------------------------------------------------------------------------

export interface SweepReport { reminders: number; overdue: number; escalations: number; universityFollowUps: number; reviewSla: number; docExpiry: number; manual: number }

/** Idempotent: running it again creates nothing new. Call from the cron route (daily) or the admin "run now" button. */
export async function runSweep(now = new Date()): Promise<SweepReport> {
  const s = await settings();
  const rep: SweepReport = { reminders: 0, overdue: 0, escalations: 0, universityFollowUps: 0, reviewSla: 0, docExpiry: 0, manual: 0 };
  const cases = await all<R>("SELECT id FROM oj_cases WHERE status IN ('active','deferred')");
  const adminIds = await admins();
  const days = [...s.reminderDays].sort((a, b) => a - b);
  for (const row of cases) {
    const loaded = await loadCase(Number(row.id));
    if (!loaded) continue;
    const { c, tasks, deps, byId } = loaded;
    for (const t of tasks) {
      if (t.obsolete || ["completed", "not_applicable"].includes(t.status) || !t.dueAt || t.naRequestedBy !== null) continue;
      const eff = effectiveStatus(t, deps, byId);
      const party = delayParty(t, deps, byId);
      const due = parseSql(t.dueAt);
      const left = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      const staffLink = taskLink(t, true);
      // Reminders before the due date go to whoever has to act, and only when they can act (not while blocked or waiting on someone else).
      const owner = t.owner === "student" ? c.userId : t.owner === "consultant" ? c.consultantId : null;
      if (left >= 0 && owner && eff !== "blocked" && t.status !== "waiting_on_university" && t.status !== "submitted_for_review") {
        const d = days.find((x) => left <= x);
        if (d !== undefined && (await notify({ userId: owner, caseId: c.id, taskId: t.id, kind: "reminder", title: `${left === 0 ? "Due today" : `Due in ${left} day${left === 1 ? "" : "s"}`}: ${t.title}`, body: t.criteria, link: taskLink(t, owner !== c.userId), dedupe: `due:${t.id}:${d}` }))) rep.reminders += 1;
      }
      if (!isOverdue(t, now)) continue;
      const late = Math.max(1, -left);
      // Overdue: the person who must act is told; the university's delay is never presented to the student as theirs.
      if (party === "student" && owner === c.userId) {
        if (await notify({ userId: c.userId, caseId: c.id, taskId: t.id, kind: "overdue", title: `Overdue: ${t.title}`, body: `This was due ${late} day${late === 1 ? "" : "s"} ago. Open it to finish or ask for help.`, link: taskLink(t, false), dedupe: `overdue:${t.id}`, force: t.priority === "critical" })) rep.overdue += 1;
        if (late >= s.consultantAfterDays && c.consultantId && (await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "escalation", title: `Student is behind: ${t.title}`, body: `${late} days overdue on the student's side.`, link: staffLink, dedupe: `esc1:${t.id}` }))) rep.escalations += 1;
      } else if (party === "consultant" && c.consultantId) {
        if (await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "overdue", title: `Overdue on your side: ${t.title}`, body: `${late} days past due.`, link: staffLink, dedupe: `overdue:${t.id}` })) rep.overdue += 1;
      } else if (party === "university" && c.consultantId) {
        const week = Math.floor(late / s.universityFollowupDays);
        if (late >= s.universityFollowupDays && (await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "university_followup", title: `Chase the university: ${t.title}`, body: `Waiting ${late} days. This is not the student's delay.`, link: staffLink, dedupe: `uni:${t.id}:${week}` }))) rep.universityFollowUps += 1;
      }
      // Level 2: managers hear about anything seriously late, whoever holds it.
      if (late >= s.managerAfterDays && party !== "university") {
        for (const a of adminIds) if (await notify({ userId: a, caseId: c.id, taskId: t.id, kind: "escalation", title: `Escalation: ${t.title}`, body: `${late} days overdue (${party}'s side).`, link: staffLink, dedupe: `esc2:${t.id}` })) rep.escalations += 1;
      }
      // A submitted task waiting for review longer than the SLA.
      if (t.status === "submitted_for_review" && t.submittedAt) {
        const waited = Math.floor((now.getTime() - parseSql(t.submittedAt).getTime()) / 86_400_000);
        if (waited >= s.reviewSlaDays && c.consultantId && (await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "review_sla", title: `Review waiting ${waited} days: ${t.title}`, body: "Students are waiting on this review.", link: staffLink, dedupe: `sla:${t.id}` }))) rep.reviewSla += 1;
      }
    }
    // Reviews waiting past the SLA even when the task is not overdue.
    for (const t of tasks) {
      if (t.status !== "submitted_for_review" || !t.submittedAt || t.obsolete) continue;
      const waited = Math.floor((now.getTime() - parseSql(t.submittedAt).getTime()) / 86_400_000);
      if (waited >= s.reviewSlaDays && c.consultantId && (await notify({ userId: c.consultantId, caseId: c.id, taskId: t.id, kind: "review_sla", title: `Review waiting ${waited} days: ${t.title}`, body: "Students are waiting on this review.", link: taskLink(t, true), dedupe: `sla:${t.id}` }))) rep.reviewSla += 1;
    }
    // Documents that expire within 30 days.
    const docs = await all<R>("SELECT id, doc_key, expires_on FROM oj_documents d WHERE case_id = $1 AND status IN ('uploaded','verified') AND expires_on IS NOT NULL AND expires_on <= $2 AND version = (SELECT MAX(version) FROM oj_documents x WHERE x.case_id = d.case_id AND x.doc_key = d.doc_key AND x.app_key = d.app_key)", [c.id, new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)]);
    for (const d of docs) if (await notify({ userId: c.userId, caseId: c.id, kind: "doc_expiry", title: `A document is expiring: ${d.doc_key}`, body: `Expires on ${String(d.expires_on).slice(0, 10)}. Upload a new version before it expires.`, link: "/abroad/journey/documents", dedupe: `docexp:${d.id}` })) rep.docExpiry += 1;
  }
  await run("UPDATE oj_documents d SET status = 'expired' WHERE d.status IN ('uploaded','verified') AND d.expires_on IS NOT NULL AND d.expires_on < $1", [now.toISOString().slice(0, 10)]);
  // Reminders staff set for themselves.
  const manual = await all<R>("SELECT r.*, c.id AS cid FROM oj_reminders r JOIN oj_cases c ON c.id = r.case_id WHERE r.done_at IS NULL AND r.remind_on <= $1", [now.toISOString().slice(0, 10)]);
  for (const r of manual) if (await notify({ userId: Number(r.for_user), caseId: Number(r.cid), taskId: r.task_id === null ? null : Number(r.task_id), kind: "manual_reminder", title: "Reminder", body: r.body, link: `/counselor/journey/${r.cid}`, dedupe: `rem:${r.id}` })) rep.manual += 1;
  return rep;
}
