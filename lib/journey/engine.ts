import { ABROAD_PACKAGES } from "../abroad/packages";
import { DONE, PRIORITY_RANK, STATUS_LABEL, type EvidenceItem, type EvidenceReq, type Role, type Status, type TaskRow } from "./types";

/**
 * The rules of the journey, as pure functions: dates, overdue, dependencies, status transitions, evidence, progress, entitlements and intake risk.
 * Nothing here touches the database, so every rule is unit-tested directly (engine.test.ts).
 */

// ---- dates --------------------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
export const fmtSql = (d: Date): string => d.toISOString().slice(0, 19).replace("T", " ");
export const parseSql = (s: string): Date => new Date(s.replace(" ", "T") + "Z");
const endOfDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59));
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "Fall 2027" -> 1 Sep 2027, "Spring 2028" -> 15 Jan 2028, "Sep 2027" -> 1 Sep 2027. Returns null when it cannot tell ("Not sure yet"). */
export function parseIntake(text: string): Date | null {
  const t = text.trim().toLowerCase();
  const y = /(20\d\d)/.exec(t);
  if (!y) return null;
  const year = Number(y[1]);
  if (t.startsWith("fall") || t.startsWith("autumn")) return new Date(Date.UTC(year, 8, 1));
  if (t.startsWith("spring")) return new Date(Date.UTC(year, 0, 15));
  if (t.startsWith("summer")) return new Date(Date.UTC(year, 4, 15));
  if (t.startsWith("winter")) return new Date(Date.UTC(year, 0, 5));
  const m = MONTHS[t.slice(0, 3)];
  return m === undefined ? null : new Date(Date.UTC(year, m, 1));
}

/**
 * Due date for a task. `from: "start"` counts from the day the case began; `from: "intake"` counts back from the intake (negative days).
 * If the intake is unknown the task falls back to a steady pace after the start (stage x 21 days). If the intake is so close that the date
 * would already be past, the task is due soon after the start instead (staggered by stage) and the case is flagged as intake-risk elsewhere.
 */
export function computeDue(rule: { from: "start" | "intake"; days: number }, start: Date, intake: Date | null, stage: number): Date {
  const floor = addDays(start, 2 + stage);
  if (rule.from === "start") return endOfDay(addDays(start, Math.max(1, rule.days)));
  if (!intake) return endOfDay(addDays(start, stage * 21 + 7));
  const raw = addDays(intake, rule.days);
  return endOfDay(raw < floor ? floor : raw);
}

// ---- overdue and blame ----------------------------------------------------------------------------------------------------

export const isDone = (s: Status): boolean => DONE.has(s);

/** Overdue is calculated, never stored: the due date has passed and the task is not completed or not applicable. */
export function isOverdue(t: Pick<TaskRow, "dueAt" | "status">, now: Date): boolean {
  return t.dueAt !== null && !isDone(t.status) && parseSql(t.dueAt).getTime() < now.getTime();
}
export function overdueDays(t: Pick<TaskRow, "dueAt" | "status">, now: Date): number {
  return isOverdue(t, now) ? Math.max(1, Math.floor((now.getTime() - parseSql(t.dueAt as string).getTime()) / DAY)) : 0;
}

// ---- dependencies ---------------------------------------------------------------------------------------------------------

/** `grp` is "" for a plain dependency (all must be done). Dependencies sharing a non-empty grp are satisfied when any one of them is done. */
export interface Dep { taskId: number; dependsOn: number; grp: string }
export type Party = "student" | "consultant" | "university";

export interface Blocker { taskId: number; title: string; status: Status; owner: Party; howToUnblock: string; anyOf: boolean }
export interface BlockInfo { blocked: boolean; kind: "dependency" | "manual" | null; reason: string; blockers: Blocker[] }

const ownerWord = (p: Party): string => (p === "student" ? "you" : p === "consultant" ? "your consultant" : "the university");

function unblockAdvice(t: TaskRow, viewer: "student" | "staff"): string {
  const who: Party = t.owner;
  if (t.status === "submitted_for_review") return viewer === "student" ? `Your consultant is reviewing "${t.title}". Nothing for you to do yet.` : `Review "${t.title}" in the review queue.`;
  if (t.status === "waiting_on_university") return viewer === "student" ? `Waiting for the university on "${t.title}". Your consultant is following up.` : `Follow up with the university on "${t.title}" and log it.`;
  if (who === "student") return viewer === "student" ? `Finish "${t.title}" first.` : `The student must finish "${t.title}"; send a reminder if it is late.`;
  if (who === "consultant") return viewer === "student" ? `Your consultant will complete "${t.title}". You will be notified.` : `Complete "${t.title}".`;
  return viewer === "student" ? `The university has to act on "${t.title}". Your consultant tracks it.` : `Chase the university for "${t.title}" and record the outcome.`;
}

/** Why a task cannot start, and what to do about it. A manual block (staff set it with a reason) and a dependency block are both explained. */
export function blockInfo(t: TaskRow, deps: Dep[], byId: Map<number, TaskRow>, viewer: "student" | "staff" = "student"): BlockInfo {
  if (isDone(t.status)) return { blocked: false, kind: null, reason: "", blockers: [] };
  const mine = deps.filter((d) => d.taskId === t.id);
  const unmet: Blocker[] = [];
  const groups = new Map<string, Dep[]>();
  for (const d of mine) {
    if (d.grp === "") {
      const x = byId.get(d.dependsOn);
      if (x && !x.obsolete && !isDone(x.status)) unmet.push({ taskId: x.id, title: x.title, status: x.status, owner: x.owner, howToUnblock: unblockAdvice(x, viewer), anyOf: false });
    } else groups.set(d.grp, [...(groups.get(d.grp) ?? []), d]);
  }
  for (const g of groups.values()) {
    const xs = g.map((d) => byId.get(d.dependsOn)).filter((x): x is TaskRow => !!x && !x.obsolete);
    if (xs.length && !xs.some((x) => isDone(x.status))) {
      const x = xs.sort((a, b) => a.id - b.id)[0];
      unmet.push({ taskId: x.id, title: x.title.replace(/ — .*$/, "") + " (at least one)", status: x.status, owner: x.owner, howToUnblock: unblockAdvice(x, viewer), anyOf: true });
    }
  }
  if (unmet.length) {
    const names = unmet.slice(0, 3).map((b) => `"${b.title}"`).join(", ");
    return { blocked: true, kind: "dependency", reason: `Waiting for ${names}${unmet.length > 3 ? ` and ${unmet.length - 3} more` : ""}.`, blockers: unmet };
  }
  if (t.status === "blocked") return { blocked: true, kind: "manual", reason: t.blockedReason || "Blocked by your consultant.", blockers: [] };
  return { blocked: false, kind: null, reason: "", blockers: [] };
}

/** The status people see: not_started becomes ready_to_start once every dependency is done, or blocked while one is not. */
export function effectiveStatus(t: TaskRow, deps: Dep[], byId: Map<number, TaskRow>): Status {
  if (t.status === "not_started" || t.status === "ready_to_start") return blockInfo(t, deps, byId).blocked ? "blocked" : "ready_to_start";
  return t.status;
}

/** Cycles make a template unusable. Returns the keys on a cycle, or null. */
export function findCycle(edges: Array<[string, string]>): string[] | null {
  const next = new Map<string, string[]>();
  for (const [a, b] of edges) next.set(a, [...(next.get(a) ?? []), b]);
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1);
    stack.push(n);
    for (const m of next.get(n) ?? []) {
      if (state.get(m) === 1) return [...stack.slice(stack.indexOf(m)), m];
      if (!state.has(m)) { const c = visit(m); if (c) return c; }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of next.keys()) if (!state.has(n)) { const c = visit(n); if (c) return c; }
  return null;
}

/** Who is holding a task up. A waiting-on-university task is the university's delay, never the student's. */
export function delayParty(t: TaskRow, deps: Dep[], byId: Map<number, TaskRow>, depth = 0): Party {
  if (t.status === "waiting_on_university" || t.owner === "university") return "university";
  if (t.status === "submitted_for_review") return "consultant";
  const eff = effectiveStatus(t, deps, byId);
  if (eff === "blocked" && depth < 6) {
    const b = blockInfo(t, deps, byId).blockers[0];
    const up = b ? byId.get(b.taskId) : undefined;
    if (up) return delayParty(up, deps, byId, depth + 1);
    return "consultant";
  }
  return t.owner === "consultant" ? "consultant" : "student";
}

// ---- evidence ---------------------------------------------------------------------------------------------------------------

const URL_RE = /^https?:\/\/[^\s]{4,}$/i;
const okDoc = (e: EvidenceItem, needVerified: boolean): boolean => (needVerified ? e.docStatus === "verified" : e.docStatus === "uploaded" || e.docStatus === "verified");

/**
 * Which requirements are still unmet. `mode: "submit"` is what a student must supply to send a reviewed task for review (staff-only parts are skipped);
 * `mode: "complete"` is what must exist for the task to be completed.
 */
export function evidenceGaps(reqs: EvidenceReq[], items: EvidenceItem[], mode: "submit" | "complete"): EvidenceReq[] {
  return reqs.filter((r) => {
    if (mode === "submit" && ((r.kind === "document" && r.verified) || (r.kind === "confirmation" && r.by === "consultant"))) {
      // Staff-side proof: for submission it is enough that the student attached a document (verified comes later).
      if (r.kind === "confirmation") return false;
      return !items.some((e) => e.kind === "document" && e.docKey === r.docKey && okDoc(e, false));
    }
    switch (r.kind) {
      case "document": return !items.some((e) => e.kind === "document" && (!r.docKey || e.docKey === r.docKey) && okDoc(e, r.verified === true));
      case "text": return !items.some((e) => e.kind === "text" && (e.text ?? "").trim().length >= 3);
      case "link": return !items.some((e) => e.kind === "link" && URL_RE.test((e.url ?? "").trim()));
      case "confirmation": {
        const staff = (x: Role) => x === "counselor" || x === "admin" || x === "system";
        return !items.some((e) => e.kind === "confirmation" && (e.text ?? "").trim().length >= 3 && (r.by === "consultant" ? staff(e.byRole) : e.byRole === "student" || staff(e.byRole)));
      }
    }
  });
}

// ---- transitions ------------------------------------------------------------------------------------------------------------

export interface Actor { role: Role; id: number | null; /** staff only: the case is theirs (assigned) or they are an admin. */ permitted: boolean }
export type Check = { ok: true } | { ok: false; error: string };
const no = (error: string): Check => ({ ok: false, error });
const OPEN: Status[] = ["not_started", "ready_to_start", "in_progress", "submitted_for_review", "changes_requested", "waiting_on_student", "waiting_on_university", "blocked"];

/**
 * May `actor` move `task` to `to`? `note` is what they wrote; `items` the evidence on file. Returns an error in plain words.
 * A task is never completed by opening a page or clicking: completion needs the evidence the task asks for, a written note, and (for reviewed
 * tasks) a staff approval. Not-applicable is a separate request-and-approve flow (see requestNa / approveNa), never a plain transition.
 */
export function checkTransition(opts: { task: TaskRow; effective: Status; to: Status; actor: Actor; note: string; items: EvidenceItem[] }): Check {
  const { task, effective, to, actor } = opts;
  const note = opts.note.trim();
  const from = task.status;
  if (actor.role !== "system" && actor.role !== "student" && !actor.permitted) return no("This student is not assigned to you.");
  if (to === "not_applicable") return no("Use the “Not applicable” request: it needs a reason and an approver.");
  if (from === to) return no(`The task is already “${STATUS_LABEL[to]}”.`);
  if (to === "not_started" || to === "ready_to_start") return no("Those statuses are worked out from the task's dependencies.");
  if (from === "not_applicable") return actor.role === "admin" || actor.role === "system" ? ({ ok: true } as Check) : no("Only an administrator can reopen a not-applicable task.");
  if (actor.role === "student") return studentMove({ task, effective, to, note, items: opts.items });
  if (from === "completed") {
    if (to !== "in_progress") return no("A completed task can only be reopened.");
    return note.length >= 5 ? { ok: true } : no("Say why you are reopening this task (at least a few words).");
  }
  // staff / system
  if (effective === "blocked" && opts.task.status !== "blocked" && (to === "in_progress" || to === "completed" || to === "submitted_for_review")) {
    return no("This task is waiting on other tasks. Finish those first, or mark it blocked/unblock deliberately.");
  }
  switch (to) {
    case "in_progress": return { ok: true };
    case "submitted_for_review": return no("Only the student submits work for review.");
    case "changes_requested": return from === "submitted_for_review" && note.length >= 5 ? { ok: true } : no(from === "submitted_for_review" ? "Tell the student what to change (a sentence)." : "Changes can only be requested on work submitted for review.");
    case "waiting_on_student": case "waiting_on_university": return note.length >= 5 ? { ok: true } : no("Say what you are waiting for (a sentence).");
    case "blocked": return note.length >= 5 ? { ok: true } : no("Give the reason it is blocked (a sentence).");
    case "completed": {
      if (!OPEN.includes(from)) return no("This task cannot be completed from here.");
      const implicit: EvidenceItem[] = note.length >= 3 ? [{ kind: "confirmation", text: note, byRole: actor.role }] : [];
      const gaps = evidenceGaps(task.evidenceReq, [...opts.items, ...implicit], "complete");
      if (note.length < 3) return no("Write a short completion note: what was done and when.");
      return gaps.length ? no(`Missing: ${gaps.map((g) => g.label).join("; ")}.`) : { ok: true };
    }
    default: return no("That change is not allowed.");
  }
}

function studentMove(o: { task: TaskRow; effective: Status; to: Status; note: string; items: EvidenceItem[] }): Check {
  const { task, effective, to, note } = o;
  const from = task.status;
  if (task.owner !== "student") return no("This step is handled by your consultant or the university, so you can't change it.");
  if (isDone(from)) return no("This task is already closed. Ask your consultant if something changed.");
  const blocked = effective === "blocked" && from !== "blocked";
  if (from === "blocked") return no("This task was blocked by your consultant. They will unblock it.");
  if (from === "submitted_for_review") return no("Your consultant is reviewing this. You can't change it until they respond.");
  switch (to) {
    case "in_progress": return blocked ? no("This task is waiting on other tasks. See what is blocking it.") : { ok: true };
    case "waiting_on_university": return task.external && note.length >= 5 ? { ok: true } : no(task.external ? "Say who you are waiting for (a sentence)." : "This task is not waiting on an outside party.");
    case "submitted_for_review": {
      if (task.review === "none") return no("This task does not need review. Complete it with your evidence instead.");
      if (from === "not_started" || from === "ready_to_start") return no("Start the task first.");
      if (blocked) return no("This task is waiting on other tasks.");
      const gaps = evidenceGaps(task.evidenceReq, o.items, "submit");
      return gaps.length ? no(`Add this before submitting: ${gaps.map((g) => g.label).join("; ")}.`) : { ok: true };
    }
    case "completed": {
      if (task.review === "consultant") return no("This task is checked by your consultant. Submit it for review instead.");
      if (from === "not_started" || from === "ready_to_start") return no("Start the task first.");
      if (blocked) return no("This task is waiting on other tasks.");
      if (note.length < 3) return no("Add a short note: what you did and when.");
      const gaps = evidenceGaps(task.evidenceReq, [...o.items, { kind: "confirmation", text: note, byRole: "student" }], "complete");
      return gaps.length ? no(`Add this to finish: ${gaps.map((g) => g.label).join("; ")}.`) : { ok: true };
    }
    default: return no("You can't set that status yourself.");
  }
}

/** Not-applicable approval: someone other than the requester, with enough authority. Students ask staff; staff ask an administrator. */
export function canApproveNa(requesterRole: Role, requesterId: number | null, approver: Actor): Check {
  if (approver.role === "student") return no("Only staff can approve “not applicable”.");
  if (requesterId !== null && approver.id === requesterId) return no("A different person must approve it.");
  if (!approver.permitted) return no("This student is not assigned to you.");
  if ((requesterRole === "counselor" || requesterRole === "admin") && approver.role !== "admin") return no("An administrator must approve a request raised by staff.");
  return { ok: true };
}

// ---- progress & next actions -------------------------------------------------------------------------------------------------

export interface Entitlement { locked: boolean; needs: string | null; level: number | null }
export function levelName(level: number): string { return ABROAD_PACKAGES.find((p) => p.level === level)?.name ?? `level ${level}`; }
/** A task needing staff delivery above the student's paid package is shown as locked, never hidden. Critical-priority tasks are never locked. */
export function entitlementFor(t: Pick<TaskRow, "minLevel" | "priority" | "owner">, packageLevel: number): Entitlement {
  if (t.minLevel === null || t.minLevel <= packageLevel || t.priority === "critical" || t.owner === "student") return { locked: false, needs: null, level: t.minLevel };
  return { locked: true, needs: levelName(t.minLevel), level: t.minLevel };
}

export interface Progress { total: number; done: number; pct: number; stages: Array<{ stage: number; total: number; done: number; pct: number }> }
const pctOf = (d: number, t: number): number => (t === 0 ? 0 : Math.round((d / t) * 100));

/** Not-applicable and obsolete tasks leave the denominator; locked tasks (not in the student's package) are counted separately by the caller. */
export function progress(tasks: Array<Pick<TaskRow, "stage" | "status" | "obsolete"> & { locked?: boolean }>): Progress {
  const live = tasks.filter((t) => !t.obsolete && t.status !== "not_applicable" && !t.locked);
  const stages = [...new Set(live.map((t) => t.stage))].sort((a, b) => a - b).map((s) => {
    const xs = live.filter((t) => t.stage === s);
    const d = xs.filter((t) => t.status === "completed").length;
    return { stage: s, total: xs.length, done: d, pct: pctOf(d, xs.length) };
  });
  const done = live.filter((t) => t.status === "completed").length;
  return { total: live.length, done, pct: pctOf(done, live.length), stages };
}

export interface Ranked { task: TaskRow; effective: Status; overdue: boolean }
/** The student's next actions: their own open, unblocked tasks, overdue first, then by priority and due date. */
export function nextActions(tasks: TaskRow[], deps: Dep[], now: Date, limit = 5): Ranked[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks
    .filter((t) => !t.obsolete && t.owner === "student")
    .map((t) => ({ task: t, effective: effectiveStatus(t, deps, byId), overdue: isOverdue(t, now) }))
    .filter((r) => ["ready_to_start", "in_progress", "changes_requested", "waiting_on_student"].includes(r.effective))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] || (a.task.dueAt ?? "9").localeCompare(b.task.dueAt ?? "9") || a.task.id - b.task.id)
    .slice(0, limit);
}

// ---- intake risk -------------------------------------------------------------------------------------------------------------

export type Risk = { level: "none" | "watch" | "high"; reasons: string[] };
/**
 * A case is at risk when the intake is close and the work is behind the pace the time left allows, or critical tasks are overdue.
 * Expected progress is the share of the time between the case start and 30 days before the intake that has passed.
 */
export function intakeRisk(o: { intake: Date | null; start: Date; now: Date; pct: number; overdueStudent: number; overdueAll: number; criticalOverdue: number }): Risk {
  const reasons: string[] = [];
  let level: Risk["level"] = "none";
  if (o.criticalOverdue > 0) { level = "high"; reasons.push(`${o.criticalOverdue} critical task${o.criticalOverdue === 1 ? " is" : "s are"} overdue`); }
  if (o.intake) {
    const left = Math.ceil((o.intake.getTime() - o.now.getTime()) / DAY);
    const span = Math.max(1, (o.intake.getTime() - 30 * DAY - o.start.getTime()) / DAY);
    const elapsed = Math.min(1, Math.max(0, (o.now.getTime() - o.start.getTime()) / DAY / span));
    const expected = Math.round(elapsed * 100);
    if (left < 0) { level = "high"; reasons.push("the intake date has passed"); }
    else if (left <= 150 && o.pct + 20 < expected) { level = "high"; reasons.push(`${left} days to intake and ${o.pct}% done (about ${expected}% expected)`); }
    else if (left <= 240 && o.pct + 10 < expected) { if (level === "none") level = "watch"; reasons.push(`${o.pct}% done against about ${expected}% expected for ${left} days to intake`); }
  }
  if (o.overdueStudent >= 3) { if (level === "none") level = "watch"; reasons.push(`${o.overdueStudent} tasks overdue on the student's side`); }
  else if (o.overdueAll >= 3 && level === "none") { level = "watch"; reasons.push(`${o.overdueAll} tasks are past their due date (${o.overdueStudent} on the student's side)`); }
  return { level, reasons };
}
