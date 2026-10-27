import { all, one, run, tx, val } from "../portal/db";
import { computeDue, fmtSql, parseIntake, parseSql } from "./engine";
import { addApplication, norm } from "./apps";
import * as N from "./notify";
import { actorFor, closeAsNa, reconcile, type Who } from "./service";
import { addRecoveryTasks, getCase, loadCase, logEvent, rebuildDeps, templateVersion, type CaseRow } from "./store";
import type { TaskDef } from "./types";

/**
 * Exception and recovery flows. Anyone on the case can request one; staff apply it. Applying never deletes: open tasks are closed as
 * "not applicable" with a stated reason and the acting staff member as approver, completed work stays, recovery tasks are added as a new attempt,
 * and every step is in the event log. No flow promises an outcome (a refused visa is not "fixed" by a task list).
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const KINDS = ["visa_refusal", "visa_reapply", "rejection", "deferral", "change_university", "withdrawal", "refund"] as const;
export type ExKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<ExKind, string> = { visa_refusal: "Visa refused", visa_reapply: "Reapply for the visa", rejection: "University rejection", deferral: "Defer to a later intake", change_university: "Change of university", withdrawal: "Withdraw from the journey", refund: "Refund request" };

export async function request(caseId: number, who: Who, kind: ExKind, reasonIn: string, detail: Record<string, string> = {}, applicationId?: number): Promise<number | string> {
  const c = await getCase(caseId);
  const actor = c ? actorFor(who, c) : null;
  if (!c || !actor) return "Case not found.";
  const reason = reasonIn.trim();
  if (!KINDS.includes(kind)) return "Unknown request.";
  if (reason.length < 10) return "Explain what happened (at least a sentence).";
  if (c.status === "withdrawn" && kind !== "refund") return "This journey was withdrawn.";
  if (["rejection", "change_university"].includes(kind) && !applicationId) return "Choose the application.";
  if (applicationId && (await val("SELECT id FROM oj_applications WHERE id = $1 AND case_id = $2", [applicationId, caseId])) === null) return "Application not found.";
  if (kind === "deferral" && !(detail.newIntake ?? "").trim()) return "Say which intake you want to move to.";
  if (kind === "change_university" && ((detail.uniName ?? "").trim().length < 2 || (detail.programme ?? "").trim().length < 3)) return "Enter the new university and programme.";
  if ((await val("SELECT id FROM oj_exceptions WHERE case_id = $1 AND kind = $2 AND status = 'requested' AND (application_id <=> $3)", [caseId, kind, applicationId ?? null])) !== null) return "That request is already waiting for staff.";
  const id = Number(await val("INSERT INTO oj_exceptions (case_id, application_id, kind, status, reason, detail_json, requested_by, created_at) VALUES ($1,$2,$3,'requested',$4,$5,$6,NOW()) RETURNING id", [caseId, applicationId ?? null, kind, reason.slice(0, 500), JSON.stringify(detail).slice(0, 1000), actor.id]));
  await logEvent({ caseId, applicationId: applicationId ?? null, actorId: actor.id, actorRole: actor.role, kind: "exception.requested", note: `${KIND_LABEL[kind]}: ${reason}`, meta: { exceptionId: id } });
  if (actor.role === "student" && c.consultantId) await N.notify({ userId: c.consultantId, caseId, kind: "exception", title: `${KIND_LABEL[kind]}: action needed`, body: reason, link: `/counselor/journey/${caseId}#exceptions`, dedupe: `exreq:${id}` });
  return id;
}

export async function pending(caseId: number): Promise<R[]> {
  return all("SELECT x.*, u.name AS requester FROM oj_exceptions x LEFT JOIN users u ON u.id = x.requested_by WHERE x.case_id = $1 ORDER BY x.id DESC LIMIT 30", [caseId]);
}

export async function decline(id: number, who: Who, note: string): Promise<string | null> {
  const x = await one<R>("SELECT * FROM oj_exceptions WHERE id = $1", [id]);
  const c = x ? await getCase(Number(x.case_id)) : null;
  const actor = c ? actorFor(who, c) : null;
  if (!x || !c || !actor || actor.role === "student") return "Request not found.";
  if (x.status !== "requested") return "That request was already handled.";
  if (note.trim().length < 5) return "Say why you are declining.";
  await run("UPDATE oj_exceptions SET status = 'declined', applied_by = $1, applied_at = NOW() WHERE id = $2", [actor.id, id]);
  await logEvent({ caseId: c.id, actorId: actor.id, actorRole: actor.role, kind: "exception.declined", note: `${KIND_LABEL[x.kind as ExKind]}: ${note}` });
  await N.notify({ userId: c.userId, caseId: c.id, kind: "exception", title: `${KIND_LABEL[x.kind as ExKind]}: not applied`, body: note, link: "/abroad/journey", dedupe: `exdec:${id}` });
  return null;
}

/** Apply a requested exception (staff only). Returns an error message, or null. */
export async function apply(id: number, who: Who, noteIn = ""): Promise<string | null> {
  const x = await one<R>("SELECT * FROM oj_exceptions WHERE id = $1", [id]);
  const c = x ? await getCase(Number(x.case_id)) : null;
  const actor = c ? actorFor(who, c) : null;
  if (!x || !c || !actor || actor.role === "student") return "Request not found.";
  if (x.status !== "requested") return "That request was already handled.";
  const kind = x.kind as ExKind;
  const appId = x.application_id === null ? null : Number(x.application_id);
  const detail = JSON.parse(String(x.detail_json || "{}")) as Record<string, string>;
  const now = new Date();
  const loaded = await loadCase(c.id);
  if (!loaded) return "Case not found.";
  const tpl = await templateVersion(c.templateKey, c.templateVersion);
  const closeOpen = async (tasks: Array<{ id: number; status: string; applicationId: number | null }>, reason: string) => {
    for (const t of tasks) if (!["completed", "not_applicable"].includes(t.status)) await closeAsNa(null, t.id, c.id, t.applicationId, actor, reason);
  };
  const attemptOf = async (k: ExKind) => 1 + Number(await val("SELECT COUNT(*) FROM oj_exceptions WHERE case_id = $1 AND kind = $2 AND status = 'applied'", [c.id, k]) ?? 0);
  let summary = "";

  switch (kind) {
    case "visa_refusal": {
      const decision = loaded.tasks.filter((t) => t.taskKey === "s10.decision" && !t.obsolete).sort((a, b) => b.attempt - a.attempt)[0];
      if (!decision) return "This journey has no visa step yet.";
      if (decision.status === "completed") return "A visa grant is already recorded. Reopen that task with a reason first if it was wrong.";
      const attempt = await attemptOf("visa_refusal");
      await tx(async (t) => {
        await t.query("UPDATE oj_tasks SET status = 'blocked', blocked_reason = 'Visa refused: see the recovery plan', updated_at = NOW() WHERE id = $1", [decision.id]);
        await addRecoveryTasks(t, c, tpl.recovery.visa_refusal ?? [], attempt, null, now);
      });
      summary = "Recovery plan created. Nothing here predicts the result of a new application.";
      break;
    }
    case "visa_reapply": {
      const done = await val("SELECT COUNT(*) FROM oj_exceptions WHERE case_id = $1 AND kind = 'visa_refusal' AND status = 'applied'", [c.id]);
      if (!Number(done)) return "Record the refusal first.";
      const opt = loaded.tasks.filter((t) => t.taskKey === "rx.visa.options").sort((a, b) => b.attempt - a.attempt)[0];
      if (!opt || opt.status !== "completed") return "The student must first decide on the next step (the recovery task “Choose the next step”).";
      const last = Math.max(...loaded.tasks.filter((t) => t.taskKey === "s10.decision").map((t) => t.attempt));
      const attempt = last + 1;
      const keys = ["s10.form", "s10.fee", "s10.appointment", "s10.attended", "s10.decision"];
      const defs = keys.map((k) => tpl.tasks.find((d) => d.key === k)).filter((d): d is TaskDef => !!d);
      await tx(async (t) => {
        for (const old of loaded.tasks.filter((o) => keys.includes(o.taskKey) && o.attempt === last && !["completed", "not_applicable"].includes(o.status))) {
          await t.query("UPDATE oj_tasks SET status = 'not_applicable', na_reason = 'Superseded by a new visa application', na_approved_by = $1, updated_at = NOW() WHERE id = $2", [actor.id, old.id]);
        }
        const start = new Date();
        const intake = parseIntake(c.intake);
        for (const d of defs) {
          const due = computeDue({ from: "start", days: 7 + 3 * keys.indexOf(d.key) }, start, intake, d.stage);
          await t.query(
            `INSERT INTO oj_tasks (case_id, application_id, app_key, attempt, template_key, template_version, task_key, stage, sub, title, description, owner_role, owner_user_id, priority, status, due_at, review, criteria, evidence_json, min_level, external, auto_check, action_label, created_at, updated_at)
             VALUES ($1,NULL,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'not_started',$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())`,
            [c.id, attempt, c.templateKey, c.templateVersion, d.key, d.stage, d.sub, `${d.title} (new application)`, d.description.slice(0, 1000), d.owner, d.owner === "student" ? c.userId : d.owner === "consultant" ? c.consultantId : null, d.priority, fmtSql(due), d.review, d.criteria, JSON.stringify(d.evidence), d.minLevel ?? null, d.external ? 1 : 0, d.auto ?? null, d.action ?? ""],
          );
        }
        
        await rebuildDeps(t, c.id);
      });
      summary = "A new visa application attempt was created. The earlier attempt stays in the history.";
      break;
    }
    case "rejection": {
      const app = loaded.apps.find((a) => a.id === appId);
      if (!app) return "Application not found.";
      const attempt = await attemptOf("rejection");
      await tx(async (t) => {
        await t.query("UPDATE oj_applications SET status = 'rejected', closed_reason = $1, updated_at = NOW() WHERE id = $2", [`Rejected: ${String(x.reason).slice(0, 200)}`, app.id]);
      });
      await closeOpen(loaded.tasks.filter((t) => t.applicationId === app.id), "The university rejected this application.");
      await tx(async (t) => { await addRecoveryTasks(t, c, tpl.recovery.rejection ?? [], attempt, null, now); });
      summary = `${app.uniName} was closed. Other applications are unaffected.`;
      break;
    }
    case "deferral": {
      const newIntake = (detail.newIntake ?? "").trim();
      const target = appId ? loaded.apps.filter((a) => a.id === appId) : loaded.apps.filter((a) => !["rejected", "withdrawn", "declined"].includes(a.status));
      for (const a of target) if ((await val("SELECT id FROM oj_applications WHERE case_id = $1 AND uni_key = $2 AND prog_key = $3 AND intake_key = $4 AND id <> $5", [c.id, norm(a.uniName), norm(a.programme), norm(newIntake), a.id])) !== null) return `You already have ${a.uniName} for ${newIntake}.`;
      const attempt = await attemptOf("deferral");
      const start = parseSql(c.startedAt);
      const intake = parseIntake(newIntake);
      let moved = 0;
      await tx(async (t) => {
        for (const a of target) await t.query("UPDATE oj_applications SET intake = $1, intake_key = $2, updated_at = NOW() WHERE id = $3", [newIntake.slice(0, 30), norm(newIntake), a.id]);
        if (!appId) {
          const prof = { ...c.profile, intake: newIntake };
          await t.query("UPDATE oj_cases SET intake = $1, profile_json = $2, updated_at = NOW() WHERE id = $3", [newIntake.slice(0, 30), JSON.stringify(prof), c.id]);
          await t.query("UPDATE sa_profiles SET intake = $1 WHERE user_id = $2", [newIntake.slice(0, 30), c.userId]);
          const defs = new Map([...tpl.tasks, ...Object.values(tpl.recovery).flat()].map((d) => [d.key, d]));
          for (const task of loaded.tasks) {
            const d = defs.get(task.taskKey);
            if (!d || d.due.from !== "intake" || ["completed", "not_applicable"].includes(task.status) || task.obsolete) continue;
            await t.query("UPDATE oj_tasks SET due_at = $1, updated_at = NOW() WHERE id = $2", [fmtSql(computeDue(d.due, start, intake, d.stage)), task.id]);
            moved += 1;
          }
        }
        await addRecoveryTasks(t, c, tpl.recovery.deferral ?? [], attempt, null, now);
      });
      summary = `Moved to ${newIntake}${appId ? "" : `; ${moved} open deadlines were rescheduled`}.`;
      break;
    }
    case "change_university": {
      const app = loaded.apps.find((a) => a.id === appId);
      if (!app) return "Application not found.";
      if (["submitted", "under_review", "offer", "accepted"].includes(app.status)) return "This application is already with the university. Withdraw it or wait for the decision before changing.";
      const created = await addApplication(c.id, { id: actor.id as number, role: actor.role as "counselor" | "admin" }, { uniName: detail.uniName, programme: detail.programme, intake: detail.intake || app.intake, category: detail.category || app.category });
      if (typeof created === "string") return created;
      await run("UPDATE oj_applications SET status = 'withdrawn', closed_reason = $1, updated_at = NOW() WHERE id = $2", [`Changed to ${detail.uniName}`.slice(0, 250), app.id]);
      await closeOpen(loaded.tasks.filter((t) => t.applicationId === app.id), "Replaced by another university.");
      summary = `${app.uniName} replaced by ${detail.uniName}. The history of the first stays.`;
      break;
    }
    case "withdrawal": {
      const attempt = await attemptOf("withdrawal");
      await closeOpen(loaded.tasks, "The student withdrew from the journey.");
      await tx(async (t) => {
        await t.query("UPDATE oj_applications SET status = 'withdrawn', closed_reason = 'Student withdrew', updated_at = NOW() WHERE case_id = $1 AND status NOT IN ('rejected','declined','withdrawn')", [c.id]);
        await t.query("UPDATE oj_cases SET status = 'withdrawn', updated_at = NOW() WHERE id = $1", [c.id]);
        await addRecoveryTasks(t, c, tpl.recovery.withdrawal ?? [], attempt, null, now);
      });
      summary = "Journey withdrawn. Everything recorded so far is kept.";
      break;
    }
    case "refund": {
      const attempt = await attemptOf("refund");
      await tx(async (t) => { await addRecoveryTasks(t, c, tpl.recovery.refund ?? [], attempt, null, now); });
      for (const a of (await all<R>("SELECT id FROM users WHERE role = 'admin'")).map((r) => Number(r.id))) await N.notify({ userId: a, caseId: c.id, kind: "refund", title: "Refund request on an overseas journey", body: `${String(x.reason).slice(0, 300)} Process it in the payments console; this system does not move money.`, link: `/counselor/journey/${c.id}#exceptions`, dedupe: `refund:${id}:${a}` });
      summary = "Recorded for review under the package terms. Refunds are decided and paid through the payments console.";
      break;
    }
  }
  await run("UPDATE oj_exceptions SET status = 'applied', applied_by = $1, applied_at = NOW() WHERE id = $2", [actor.id, id]);
  await logEvent({ caseId: c.id, applicationId: appId, actorId: actor.id, actorRole: actor.role, kind: "exception.applied", note: `${KIND_LABEL[kind]}: ${summary}${noteIn ? " " + noteIn : ""}`, meta: { exceptionId: id } });
  await N.notify({ userId: c.userId, caseId: c.id, kind: "exception", title: `${KIND_LABEL[kind]}: recorded`, body: summary, link: "/abroad/journey", dedupe: `exapp:${id}` });
  await reconcile(c.id);
  return null;
}

/** Staff-initiated: request and apply in one step. */
export async function recordNow(caseId: number, who: Who, kind: ExKind, reason: string, detail: Record<string, string> = {}, applicationId?: number): Promise<string | null> {
  const id = await request(caseId, who, kind, reason, detail, applicationId);
  if (typeof id === "string") return id;
  const err = await apply(id, who);
  if (err) await run("UPDATE oj_exceptions SET status = 'declined', applied_at = NOW() WHERE id = $1", [id]);
  return err;
}

export type { CaseRow };
