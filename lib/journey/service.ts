import { all, one, run, tx, val } from "../portal/db";
import { blockInfo, canApproveNa, checkTransition, delayParty, effectiveStatus, entitlementFor, evidenceGaps, intakeRisk, isOverdue, nextActions, overdueDays, parseIntake, parseSql, progress, type Actor, type BlockInfo, type Entitlement, type Party, type Risk } from "./engine";
import * as N from "./notify";
import { addEvidence, evidenceFor, getCase, loadCase, loadTask, logEvent, mapApp, packageLevel, type CaseRow, type Loaded } from "./store";
import type { Role, Status, TaskRow } from "./types";

/** The operations on tasks: status changes with evidence rules, evidence, reviews, not-applicable requests and automatic checks. Every change is logged. */

export interface Who { id: number; role: "student" | "counselor" | "admin" }
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** What this person is to the case, or null when they may not see it at all (a student's own case only; a counselor's assigned cases; admins all). */
export function actorFor(who: Who, c: CaseRow): Actor | null {
  if (who.role === "student") return c.userId === who.id ? { role: "student", id: who.id, permitted: true } : null;
  if (who.role === "admin") return { role: "admin", id: who.id, permitted: true };
  if (who.role === "counselor") return c.consultantId === who.id ? { role: "counselor", id: who.id, permitted: true } : null;
  return null;
}

// ---- view model --------------------------------------------------------------------------------------------------------------------

export interface TaskView { task: TaskRow; effective: Status; block: BlockInfo; overdue: boolean; overdueDays: number; party: Party; ent: Entitlement; naPending: boolean }
export interface CaseView {
  loaded: Loaded; level: number; tasks: TaskView[]; progress: ReturnType<typeof progress>; locked: TaskView[];
  counts: { pending: number; awaitingReview: number; overdueStudent: number; overdueAll: number; waitingUniversity: number; blocked: number; completed: number; criticalOverdue: number };
  next: TaskView[]; risk: Risk;
}

export async function viewCase(caseId: number, now = new Date(), levelOverride?: number): Promise<CaseView | null> {
  const loaded = await loadCase(caseId);
  if (!loaded) return null;
  const level = levelOverride ?? (await packageLevel(loaded.c.userId));
  return buildView(loaded, level, now);
}

export function buildView(loaded: Loaded, level: number, now: Date): CaseView {
  const { tasks, deps, byId, c } = loaded;
  const live = tasks.filter((t) => !t.obsolete);
  const tv: TaskView[] = live.map((t) => {
    const block = blockInfo(t, deps, byId);
    return { task: t, effective: effectiveStatus(t, deps, byId), block, overdue: isOverdue(t, now), overdueDays: overdueDays(t, now), party: delayParty(t, deps, byId), ent: entitlementFor(t, level), naPending: t.naRequestedBy !== null && t.status !== "not_applicable" };
  });
  const locked = tv.filter((v) => v.ent.locked);
  const open = tv.filter((v) => !v.ent.locked);
  const pr = progress(tv.map((v) => ({ stage: v.task.stage, status: v.task.status, obsolete: false, locked: v.ent.locked })));
  const overdue = open.filter((v) => v.overdue);
  const counts = {
    // "To do" is what can be worked on now; steps still waiting behind earlier ones are counted as blocked only when they are close or were blocked on purpose.
    pending: open.filter((v) => !["completed", "not_applicable"].includes(v.task.status) && v.effective !== "blocked").length,
    awaitingReview: open.filter((v) => v.task.status === "submitted_for_review").length,
    overdueStudent: overdue.filter((v) => v.party === "student").length,
    overdueAll: overdue.length,
    waitingUniversity: open.filter((v) => v.task.status === "waiting_on_university" || (v.task.owner === "university" && v.task.status !== "completed" && v.task.status !== "not_applicable")).length,
    blocked: open.filter((v) => v.effective === "blocked" && (v.block.kind === "manual" || v.overdue || (v.task.dueAt !== null && parseSql(v.task.dueAt).getTime() < now.getTime() + 30 * 86_400_000))).length,
    completed: open.filter((v) => v.task.status === "completed").length,
    criticalOverdue: overdue.filter((v) => v.task.priority === "critical").length,
  };
  const ranked = nextActions(open.map((v) => v.task), deps, now, 6);
  const next = ranked.map((r) => open.find((v) => v.task.id === r.task.id) as TaskView);
  const risk = intakeRisk({ intake: parseIntake(c.intake), start: parseSql(c.startedAt), now, pct: pr.pct, overdueStudent: counts.overdueStudent, overdueAll: counts.overdueAll, criticalOverdue: counts.criticalOverdue });
  return { loaded, level, tasks: tv, progress: pr, locked, counts, next, risk };
}

// ---- status changes ---------------------------------------------------------------------------------------------------------------------

export interface MoveOpts { applicationId?: number; offer?: { type: string; conditions: string; deadline: string; deposit: string }; now?: Date }

export async function moveTask(taskId: number, who: Who, to: Status, noteIn = "", opts: MoveOpts = {}): Promise<string | null> {
  const lt = await loadTask(taskId);
  if (!lt) return "Task not found.";
  const { task, loaded } = lt;
  const actor = actorFor(who, loaded.c);
  if (!actor) return "Task not found.";
  if (loaded.c.status === "withdrawn" && actor.role === "student") return "This journey was withdrawn. Contact your consultant to reopen it.";
  const note = noteIn.trim();
  const level = await packageLevel(loaded.c.userId);
  if (task.owner === "consultant" && entitlementFor(task, level).locked && (to === "completed" || to === "in_progress")) return "This service is not part of the student's package. It unlocks when the package is purchased.";
  const eff = effectiveStatus(task, loaded.deps, loaded.byId);
  const items = await evidenceFor(taskId);
  const check = checkTransition({ task, effective: eff, to, actor, note, items });
  if (!check.ok) return check.error;

  // Task-specific inputs that must exist before completion.
  if (to === "completed" && task.taskKey === "s8.decision") {
    const chosen = loaded.apps.find((a) => a.id === opts.applicationId);
    if (!chosen || chosen.status !== "offer") return "Choose one of your offers to accept.";
  }
  if (to === "completed" && task.taskKey === "s8a.offer_record") {
    if (!opts.offer || !["conditional", "unconditional"].includes(opts.offer.type)) return "Record whether the offer is conditional or unconditional.";
    if (opts.offer.type === "conditional" && opts.offer.conditions.trim().length < 5) return "List the offer's conditions.";
  }

  const done = await tx(async (c) => {
    const sets = ["status = $1", "updated_at = NOW()"];
    const p: unknown[] = [to];
    if (to === "in_progress") { sets.push("started_at = COALESCE(started_at, NOW())"); if (task.status === "completed") sets.push("completed_at = NULL", "completed_by = NULL"); sets.push("blocked_reason = ''"); }
    if (to === "submitted_for_review") sets.push("submitted_at = NOW()");
    if (to === "completed") { p.push(actor.id); sets.push("completed_at = NOW()", `completed_by = $${p.length}`, "started_at = COALESCE(started_at, NOW())", "blocked_reason = ''"); }
    if (to === "blocked") { p.push(note.slice(0, 255)); sets.push(`blocked_reason = $${p.length}`); }
    p.push(taskId, task.status);
    const r = await c.query(`UPDATE oj_tasks SET ${sets.join(", ")} WHERE id = $${p.length - 1} AND status = $${p.length}`, p);
    if (r.rowCount === 0) return false;
    if (to === "completed" && note.length >= 3) await addEvidence({ taskId, caseId: task.caseId, kind: "confirmation", text: note, byRole: actor.role, byUser: actor.id }, c);
    await logEvent({ caseId: task.caseId, taskId, applicationId: task.applicationId, actorId: actor.id, actorRole: actor.role, kind: "status", from: task.status, to, note }, c);
    if (to === "completed") await applyCompletionEffects(c, task, loaded, actor, opts);
    return true;
  });
  if (!done) return "Someone else just changed this task. Refresh and try again.";

  await N.afterTaskChange(task, to, actor, note, loaded.c);
  await reconcile(task.caseId, opts.now);
  return null;
}

type Tx = Parameters<Parameters<typeof tx>[0]>[0];

/** Things that become true because a particular task was verifiably completed (never the other way round). */
async function applyCompletionEffects(c: Tx, task: TaskRow, loaded: Loaded, actor: Actor, opts: MoveOpts): Promise<void> {
  const app = task.applicationId ? loaded.apps.find((a) => a.id === task.applicationId) : undefined;
  const setApp = async (id: number, status: string, extra = "") => {
    await c.query(`UPDATE oj_applications SET status = $1, updated_at = NOW()${extra} WHERE id = $2`, [status, id]);
    await logEvent({ caseId: task.caseId, applicationId: id, actorId: actor.id, actorRole: actor.role, kind: "application.status", to: status, note: task.title }, c);
  };
  switch (task.taskKey) {
    case "s3a.approve": if (app) await setApp(app.id, "preparing", ", approved_at = NOW()"); break;
    case "s6a.submit": if (app) await setApp(app.id, "submitted", ", submitted_at = NOW()"); break;
    case "s6a.confirmation": if (app && app.status === "submitted") await setApp(app.id, "under_review"); break;
    case "s7a.decision": if (app) await setApp(app.id, "offer"); break;
    case "s8a.offer_record":
      if (app && opts.offer) {
        await c.query("UPDATE oj_applications SET offer_type = $1, offer_conditions = $2, offer_deadline = $3, deposit_amount = $4, updated_at = NOW() WHERE id = $5", [opts.offer.type, opts.offer.conditions.slice(0, 1000), opts.offer.deadline || null, opts.offer.deposit.slice(0, 40), app.id]);
        if (opts.offer.type === "unconditional") {
          const r = await c.query<R>("SELECT id, status FROM oj_tasks WHERE case_id = $1 AND application_id = $2 AND task_key = 's8a.conditions'", [task.caseId, app.id]);
          for (const t of r.rows) if (!["completed", "not_applicable"].includes(t.status)) await closeAsNa(c, Number(t.id), task.caseId, app.id, actor, "Unconditional offer: there are no conditions to meet.");
        }
      }
      break;
    case "s8.decision": if (opts.applicationId) await setApp(opts.applicationId, "accepted"); break;
    case "s8.decline_others": {
      const offers = loaded.apps.filter((a) => a.status === "offer");
      for (const a of offers) await setApp(a.id, "declined");
      break;
    }
    case "s12.arrived": await c.query("UPDATE sa_profiles SET stage = 'ALUMNI', updated_at = NOW() WHERE user_id = $1", [loaded.c.userId]); break;
  }
}

/** Close a task as not applicable because of a recorded event (not a request). The acting staff member is the approver; the reason is stored and logged. */
export async function closeAsNa(c: Tx | null, taskId: number, caseId: number, appId: number | null, actor: Actor, reason: string): Promise<void> {
  const sql = "UPDATE oj_tasks SET status = 'not_applicable', na_reason = $1, na_approved_by = $2, updated_at = NOW() WHERE id = $3 AND status NOT IN ('completed','not_applicable')";
  const p = [reason.slice(0, 255), actor.id, taskId];
  const n = c ? (await c.query(sql, p)).rowCount : await run(sql, p);
  if (n) await logEvent({ caseId, taskId, applicationId: appId, actorId: actor.id, actorRole: actor.role, kind: "na.system", to: "not_applicable", note: reason }, c);
}

// ---- evidence ---------------------------------------------------------------------------------------------------------------------------

export async function addNoteEvidence(taskId: number, who: Who, kind: "text" | "link" | "confirmation", valueIn: string): Promise<string | null> {
  const lt = await loadTask(taskId);
  if (!lt) return "Task not found.";
  const { task, loaded } = lt;
  const actor = actorFor(who, loaded.c);
  if (!actor) return "Task not found.";
  const value = valueIn.trim();
  if (["completed", "not_applicable"].includes(task.status)) return "This task is closed.";
  if (actor.role === "student" && (task.owner !== "student" || task.status === "submitted_for_review" || task.status === "blocked")) return "You can't add to this task right now.";
  if (kind === "link" && !/^https:\/\/[^\s]{4,}$/i.test(value)) return "Enter a full link that starts with https://";
  if (value.length < 3) return "Write at least a few characters.";
  await addEvidence({ taskId, caseId: task.caseId, kind, text: kind === "link" ? undefined : value, url: kind === "link" ? value : undefined, byRole: actor.role, byUser: actor.id });
  await logEvent({ caseId: task.caseId, taskId, applicationId: task.applicationId, actorId: actor.id, actorRole: actor.role, kind: "evidence.added", note: `${kind}: ${value.slice(0, 120)}` });
  await run("UPDATE oj_tasks SET updated_at = NOW() WHERE id = $1", [taskId]);
  return null;
}

/** Attach the newest version of a document the student already uploaded to a task that asks for that document type. */
export async function attachExistingDoc(taskId: number, docId: number, who: Who): Promise<string | null> {
  const lt = await loadTask(taskId);
  if (!lt) return "Task not found.";
  const { task, loaded } = lt;
  const actor = actorFor(who, loaded.c);
  if (!actor) return "Task not found.";
  if (["completed", "not_applicable"].includes(task.status)) return "This task is closed.";
  if (actor.role === "student" && (task.owner !== "student" || task.status === "submitted_for_review")) return "You can't add to this task right now.";
  const d = await one<R>("SELECT * FROM oj_documents WHERE id = $1 AND case_id = $2", [docId, task.caseId]);
  if (!d) return "Document not found.";
  if (!task.evidenceReq.some((r) => r.kind === "document" && r.docKey === d.doc_key)) return "This task does not ask for that kind of document.";
  if ((task.applicationId ?? 0) !== Number(d.app_key)) return "That document belongs to a different university.";
  await addEvidence({ taskId, caseId: task.caseId, kind: "document", docId, docKey: d.doc_key, byRole: actor.role, byUser: actor.id });
  await logEvent({ caseId: task.caseId, taskId, applicationId: task.applicationId, actorId: actor.id, actorRole: actor.role, kind: "evidence.document", note: `${d.doc_key} v${d.version}` });
  return null;
}

// ---- not applicable (reason + approver) ----------------------------------------------------------------------------------------------------

export async function requestNa(taskId: number, who: Who, reasonIn: string): Promise<string | null> {
  const lt = await loadTask(taskId);
  if (!lt) return "Task not found.";
  const { task, loaded } = lt;
  const actor = actorFor(who, loaded.c);
  if (!actor) return "Task not found.";
  const reason = reasonIn.trim();
  if (reason.length < 10) return "Explain why this does not apply (at least a sentence).";
  if (["completed", "not_applicable"].includes(task.status)) return "This task is already closed.";
  if (task.naRequestedBy !== null) return "A request is already waiting for approval.";
  if (actor.role === "student" && task.owner !== "student") return "Ask your consultant about this step.";
  if (task.priority === "critical" && actor.role === "student") return "Critical steps can only be marked not applicable by your consultant, with an administrator's approval.";
  await run("UPDATE oj_tasks SET na_reason = $1, na_requested_by = $2, na_requested_at = NOW(), updated_at = NOW() WHERE id = $3", [reason.slice(0, 255), actor.id, taskId]);
  await logEvent({ caseId: task.caseId, taskId, applicationId: task.applicationId, actorId: actor.id, actorRole: actor.role, kind: "na.requested", note: reason });
  await N.naRequested(task, actor, loaded.c, reason);
  return null;
}

export async function decideNa(taskId: number, who: Who, approve: boolean, noteIn = ""): Promise<string | null> {
  const lt = await loadTask(taskId);
  if (!lt) return "Task not found.";
  const { task, loaded } = lt;
  const actor = actorFor(who, loaded.c);
  if (!actor) return "Task not found.";
  if (task.naRequestedBy === null || task.status === "not_applicable") return "There is no request to decide.";
  const reqRole = ((await val("SELECT role FROM users WHERE id = $1", [task.naRequestedBy])) as Role | null) ?? "student";
  const ok = canApproveNa(reqRole, task.naRequestedBy, actor);
  if (!ok.ok) return ok.error;
  if (!approve && noteIn.trim().length < 5) return "Say why you are declining.";
  if (approve) await run("UPDATE oj_tasks SET status = 'not_applicable', na_approved_by = $1, updated_at = NOW() WHERE id = $2", [actor.id, taskId]);
  else await run("UPDATE oj_tasks SET na_requested_by = NULL, na_requested_at = NULL, na_reason = '', updated_at = NOW() WHERE id = $1", [taskId]);
  await logEvent({ caseId: task.caseId, taskId, applicationId: task.applicationId, actorId: actor.id, actorRole: actor.role, kind: approve ? "na.approved" : "na.declined", from: task.status, to: approve ? "not_applicable" : task.status, note: approve ? task.naReason : noteIn });
  await N.naDecided(task, loaded.c, approve, noteIn);
  await reconcile(task.caseId);
  return null;
}

// ---- automatic checks -------------------------------------------------------------------------------------------------------------------------

async function autoFact(check: string, c: CaseRow, loaded: Loaded): Promise<string | null> {
  switch (check) {
    case "email_verified": return (await val("SELECT email_verified_at FROM users WHERE id = $1", [c.userId])) ? "Email address confirmed" : null;
    case "profile_complete": return (await val("SELECT user_id FROM sa_profiles WHERE user_id = $1 AND consent_at IS NOT NULL AND academic_index IS NOT NULL", [c.userId])) !== null ? "Profile saved with consent" : null;
    case "shortlist_mix": {
      const cats = new Set(loaded.apps.filter((a) => !["withdrawn", "declined", "rejected"].includes(a.status)).map((a) => a.category));
      return cats.has("ambitious") && cats.has("target") && cats.has("safer") ? "Shortlist has ambitious, target and safer options" : null;
    }
    case "core_docs_verified": {
      const rows = await all<R>(`SELECT d.doc_key, d.status FROM oj_documents d WHERE d.case_id = $1 AND d.app_key = 0 AND d.doc_key IN ('passport','transcripts','cv') AND d.version = (SELECT MAX(version) FROM oj_documents x WHERE x.case_id = d.case_id AND x.doc_key = d.doc_key AND x.app_key = 0)`, [c.id]);
      return ["passport", "transcripts", "cv"].every((k) => rows.some((r) => r.doc_key === k && r.status === "verified")) ? "Passport, transcripts and CV verified by staff" : null;
    }
    default: return null;
  }
}

/** Complete tasks whose condition can be proved from stored facts (email confirmed, profile saved, shortlist mix, core documents verified). Never touches a blocked task. */
export async function runAutoChecks(caseId: number): Promise<number> {
  let loaded = await loadCase(caseId);
  if (!loaded || loaded.c.status === "withdrawn") return 0;
  let n = 0;
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    for (const t of loaded.tasks) {
      if (!t.auto || t.obsolete || ["completed", "not_applicable"].includes(t.status) || t.naRequestedBy !== null) continue;
      if (effectiveStatus(t, loaded.deps, loaded.byId) === "blocked") continue;
      const fact = await autoFact(t.auto, loaded.c, loaded);
      if (!fact) continue;
      const ok = await run("UPDATE oj_tasks SET status = 'completed', completed_at = NOW(), started_at = COALESCE(started_at, NOW()), completed_by = NULL, updated_at = NOW() WHERE id = $1 AND status NOT IN ('completed','not_applicable')", [t.id]);
      if (!ok) continue;
      await addEvidence({ taskId: t.id, caseId, kind: "confirmation", text: `Checked automatically: ${fact}`, byRole: "system", byUser: null });
      await logEvent({ caseId, taskId: t.id, applicationId: t.applicationId, actorId: null, actorRole: "system", kind: "status", from: t.status, to: "completed", note: `Automatic check: ${fact}` });
      changed += 1; n += 1;
    }
    if (!changed) break;
    loaded = (await loadCase(caseId)) as Loaded;
  }
  return n;
}

/** After anything changes: run automatic checks. (Readiness, ready-to-start and blocked states are calculated from the dependency rows, so nothing else needs rewriting.) */
export async function reconcile(caseId: number, _now?: Date): Promise<void> {
  await runAutoChecks(caseId);
}

// ---- review queue ---------------------------------------------------------------------------------------------------------------------------------

export interface QueueItem { taskId: number; caseId: number; student: string; title: string; stage: number; app: string | null; submittedAt: string; waitDays: number; priority: string; destination: string }
export async function reviewQueue(who: Who, now = new Date()): Promise<QueueItem[]> {
  if (who.role === "student") return [];
  const rows = await all<R>(
    `SELECT t.id, t.case_id, t.title, t.stage, t.priority, t.submitted_at, t.updated_at, u.name AS student, c.destination, a.uni_name FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id JOIN users u ON u.id = c.user_id
       LEFT JOIN oj_applications a ON a.id = t.application_id WHERE t.status = 'submitted_for_review' AND t.obsolete = 0 AND c.status <> 'withdrawn' ${who.role === "counselor" ? "AND c.consultant_id = $1" : ""} ORDER BY t.submitted_at ASC, t.id ASC LIMIT 200`,
    who.role === "counselor" ? [who.id] : [],
  );
  return rows.map((r) => ({ taskId: Number(r.id), caseId: Number(r.case_id), student: r.student, title: r.title, stage: Number(r.stage), app: r.uni_name ?? null, submittedAt: String(r.submitted_at ?? r.updated_at), waitDays: Math.floor((now.getTime() - parseSql(String(r.submitted_at ?? r.updated_at)).getTime()) / 86_400_000), priority: r.priority, destination: r.destination }));
}

export { evidenceGaps, getCase, mapApp };
