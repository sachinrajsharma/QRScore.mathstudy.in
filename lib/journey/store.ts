import { all, one, run, tx, val, type Conn } from "../portal/db";
import { entitlementsFor } from "../pay/entitlements";
import { ABROAD_PACKAGES } from "../abroad/packages";
import { BUILTIN_TEMPLATE } from "./default-template";
import { computeDue, fmtSql, parseIntake, type Dep } from "./engine";
import { resolveDeps, tasksFor, templateHash, type Instance } from "./template";
import type { CaseProfile, EvidenceItem, EvidenceReq, OwnerRole, Priority, Role, Status, TaskDef, TaskRow, TemplateDef } from "./types";

/** Data access for the journey: templates, cases, task generation, dependency rows, events and settings. */

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- templates ---------------------------------------------------------------------------------------------------------------

export interface TemplateRow { key: string; version: number; source: string; def: TemplateDef }
const cache = new Map<string, TemplateDef>();

export async function templateVersion(key: string, version: number): Promise<TemplateDef> {
  const ck = `${key}@${version}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const r = await one<R>("SELECT definition FROM oj_templates WHERE template_key = $1 AND version = $2", [key, version]);
  if (!r) throw new Error(`Template ${ck} not found`);
  const def = JSON.parse(String(r.definition)) as TemplateDef;
  cache.set(ck, def);
  return def;
}

/** The newest published template. The built-in one is stored on first use; if the code's built-in changed, it is stored as the next version (existing cases keep theirs). */
export async function currentTemplate(): Promise<TemplateRow> {
  const key = BUILTIN_TEMPLATE.key;
  const hash = templateHash(BUILTIN_TEMPLATE);
  const latest = await one<R>("SELECT version, source, hash FROM oj_templates WHERE template_key = $1 ORDER BY version DESC LIMIT 1", [key]);
  if (!latest || (latest.source === "builtin" && latest.hash !== hash)) {
    const version = (latest ? Number(latest.version) : 0) + 1;
    try {
      await run("INSERT INTO oj_templates (template_key, version, source, hash, definition, note) VALUES ($1,$2,'builtin',$3,$4,$5)", [key, version, hash, JSON.stringify(BUILTIN_TEMPLATE), latest ? "Built-in template updated" : "Initial built-in template"]);
    } catch {
      /* another request stored it first */
    }
    return currentTemplate();
  }
  const version = Number(latest.version);
  return { key, version, source: String(latest.source), def: await templateVersion(key, version) };
}

export async function publishTemplate(def: TemplateDef, adminId: number, note: string): Promise<number> {
  const latest = Number(await val("SELECT MAX(version) FROM oj_templates WHERE template_key = $1", [def.key]) ?? 0);
  const version = latest + 1;
  await run("INSERT INTO oj_templates (template_key, version, source, hash, definition, note, created_by) VALUES ($1,$2,'admin',$3,$4,$5,$6)", [def.key, version, templateHash(def), JSON.stringify(def), Array.from(note).slice(0, 255).join(""), adminId]);
  return version;
}

export async function templateVersions(key = BUILTIN_TEMPLATE.key): Promise<Array<{ version: number; source: string; note: string; created_at: string; cases: number; tasks: number }>> {
  return all(`SELECT t.version, t.source, t.note, t.created_at, (SELECT COUNT(*) FROM oj_cases c WHERE c.template_key = t.template_key AND c.template_version = t.version) AS cases,
    JSON_LENGTH(JSON_EXTRACT(t.definition, '$.tasks')) AS tasks FROM oj_templates t WHERE t.template_key = $1 ORDER BY t.version DESC`, [key]);
}

// ---- mapping ---------------------------------------------------------------------------------------------------------------------

export interface CaseRow {
  id: number; userId: number; templateKey: string; templateVersion: number; profile: CaseProfile; destination: string; degree: string; intake: string; consultantId: number | null;
  status: "active" | "deferred" | "withdrawn" | "completed"; startedAt: string; legacy: boolean; createdAt: string; updatedAt: string;
}
export const mapCase = (r: R): CaseRow => ({
  id: Number(r.id), userId: Number(r.user_id), templateKey: r.template_key, templateVersion: Number(r.template_version), profile: JSON.parse(r.profile_json), destination: r.destination, degree: r.degree, intake: r.intake,
  consultantId: r.consultant_id === null ? null : Number(r.consultant_id), status: r.status, startedAt: String(r.started_at), legacy: Number(r.imported_from_legacy) === 1, createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});

export const mapTask = (r: R): TaskRow => ({
  id: Number(r.id), caseId: Number(r.case_id), applicationId: r.application_id === null ? null : Number(r.application_id), templateKey: r.template_key, templateVersion: Number(r.template_version), taskKey: r.task_key,
  stage: Number(r.stage), sub: r.sub, title: r.title, description: r.description, owner: r.owner_role as OwnerRole, ownerUserId: r.owner_user_id === null ? null : Number(r.owner_user_id), priority: r.priority as Priority, status: r.status as Status,
  dueAt: r.due_at ? String(r.due_at) : null, review: r.review, criteria: r.criteria, evidenceReq: JSON.parse(r.evidence_json) as EvidenceReq[], minLevel: r.min_level === null ? null : Number(r.min_level), external: Number(r.external) === 1,
  auto: r.auto_check ?? null, action: r.action_label, blockedReason: r.blocked_reason, naReason: r.na_reason, naRequestedBy: r.na_requested_by === null ? null : Number(r.na_requested_by), naApprovedBy: r.na_approved_by === null ? null : Number(r.na_approved_by),
  startedAt: r.started_at ? String(r.started_at) : null, submittedAt: r.submitted_at ? String(r.submitted_at) : null, completedAt: r.completed_at ? String(r.completed_at) : null, completedBy: r.completed_by === null ? null : Number(r.completed_by),
  createdAt: String(r.created_at), updatedAt: String(r.updated_at), obsolete: Number(r.obsolete) === 1, attempt: Number(r.attempt),
});

export interface AppRow {
  id: number; caseId: number; universityId: number | null; uniName: string; programme: string; intake: string; category: "ambitious" | "target" | "safer"; status: string; offerType: string; offerConditions: string; offerDeadline: string | null;
  depositAmount: string; tuitionNote: string; scholarshipNote: string; approvedAt: string | null; submittedAt: string | null; closedReason: string; createdAt: string;
}
export const mapApp = (r: R): AppRow => ({
  id: Number(r.id), caseId: Number(r.case_id), universityId: r.university_id === null ? null : Number(r.university_id), uniName: r.uni_name, programme: r.programme, intake: r.intake, category: r.category, status: r.status, offerType: r.offer_type,
  offerConditions: r.offer_conditions, offerDeadline: r.offer_deadline ? String(r.offer_deadline) : null, depositAmount: r.deposit_amount, tuitionNote: r.tuition_note, scholarshipNote: r.scholarship_note,
  approvedAt: r.approved_at ? String(r.approved_at) : null, submittedAt: r.submitted_at ? String(r.submitted_at) : null, closedReason: r.closed_reason, createdAt: String(r.created_at),
});

// ---- events (the audit trail) -----------------------------------------------------------------------------------------------------

export interface EventInput { caseId: number; taskId?: number | null; applicationId?: number | null; actorId: number | null; actorRole: Role; kind: string; from?: string; to?: string; note?: string; meta?: Record<string, unknown> }
type Q = Pick<Conn, "query">;
const q = async (c: Q | null, sql: string, p: unknown[] = []): Promise<{ rows: R[]; rowCount: number }> => (c ? c.query<R>(sql, p) : { rows: await all<R>(sql, p), rowCount: 0 });

export async function logEvent(e: EventInput, c: Q | null = null): Promise<void> {
  const sql = "INSERT INTO oj_events (case_id, task_id, application_id, actor_id, actor_role, kind, from_status, to_status, note, meta_json, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())";
  const p = [e.caseId, e.taskId ?? null, e.applicationId ?? null, e.actorId, e.actorRole, e.kind, e.from ?? "", e.to ?? "", Array.from(e.note ?? "").slice(0, 1000).join(""), JSON.stringify(e.meta ?? {}).slice(0, 2000)];
  if (c) await c.query(sql, p);
  else await run(sql, p);
}

// ---- generation ------------------------------------------------------------------------------------------------------------------

const ownerUser = (def: TaskDef, c: CaseRow): number | null => (def.owner === "student" ? c.userId : def.owner === "consultant" ? c.consultantId : null);

async function insertTask(c: Conn, cs: CaseRow, tpl: { key: string; version: number }, def: TaskDef, appId: number | null, attempt: number, start: Date, intake: Date | null): Promise<number> {
  const due = computeDue(def.due, start, intake, def.stage);
  const r = await c.query<R>(
    `INSERT INTO oj_tasks (case_id, application_id, app_key, attempt, template_key, template_version, task_key, stage, sub, title, description, owner_role, owner_user_id, priority, status, due_at, review, criteria, evidence_json, min_level, external, auto_check, action_label, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'not_started',$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW()) RETURNING id`,
    [cs.id, appId, appId ?? 0, attempt, tpl.key, tpl.version, def.key, def.stage, def.sub, def.title, def.description.slice(0, 1000), def.owner, ownerUser(def, cs), def.priority, fmtSql(due), def.review, def.criteria,
      JSON.stringify(def.evidence), def.minLevel ?? null, def.external ? 1 : 0, def.auto ?? null, def.action ?? ""],
  );
  return Number(r.rows[0].id);
}

/** Replace the dependency rows of every live task in a case from the template definitions. Deterministic, so safe to call after any change. */
export async function rebuildDeps(c: Conn, caseId: number): Promise<void> {
  const rows = (await c.query<R>("SELECT id, task_key, application_id, attempt, template_key, template_version, obsolete FROM oj_tasks WHERE case_id = $1", [caseId])).rows;
  const defs = new Map<string, Map<string, TaskDef>>();
  for (const r of rows) {
    const ck = `${r.template_key}@${r.template_version}`;
    if (!defs.has(ck)) {
      const t = await templateVersion(r.template_key, Number(r.template_version));
      defs.set(ck, new Map([...t.tasks, ...Object.values(t.recovery).flat()].map((d) => [d.key, d])));
    }
  }
  const live = rows.filter((r) => Number(r.obsolete) === 0);
  const inst: Instance[] = [];
  for (const r of live) {
    const d = defs.get(`${r.template_key}@${r.template_version}`)?.get(r.task_key);
    if (!d) continue;
    inst.push({ ref: String(r.id), key: r.task_key, scope: d.scope, appId: r.application_id === null ? null : Number(r.application_id), deps: d.deps, attempt: Number(r.attempt) });
  }
  const edges = resolveDeps(inst);
  await c.query("DELETE FROM oj_task_deps WHERE task_id IN (SELECT id FROM oj_tasks WHERE case_id = $1)", [caseId]);
  for (const e of edges) await c.query("INSERT IGNORE INTO oj_task_deps (task_id, depends_on, grp) VALUES ($1,$2,$3)", [Number(e.from), Number(e.to), e.grp]);
}

export interface CaseInput { destination: string; degree: "UG" | "PG" | "PhD"; intake: string; visaRoute?: string; englishExempt?: boolean; entranceTestNeeded?: boolean; needsFunding?: boolean; needsLoan?: boolean; wantsScholarship?: boolean; needsAccommodation?: boolean; hasWorkExperience?: boolean; hasStudyGap?: boolean; portfolioNeeded?: boolean; wantsInternship?: boolean; wantsPartTime?: boolean }

export const profileOf = (i: CaseInput): CaseProfile => ({
  destination: i.destination, degree: i.degree, intake: i.intake, visaRoute: i.visaRoute || "student", englishExempt: !!i.englishExempt, entranceTestNeeded: !!i.entranceTestNeeded, needsFunding: !!i.needsFunding, needsLoan: !!i.needsLoan,
  wantsScholarship: !!i.wantsScholarship, needsAccommodation: !!i.needsAccommodation, hasWorkExperience: !!i.hasWorkExperience, hasStudyGap: !!i.hasStudyGap, portfolioNeeded: !!i.portfolioNeeded, wantsInternship: !!i.wantsInternship, wantsPartTime: !!i.wantsPartTime,
});

/** Create the student's case from their answers and generate the personalised case-level checklist. One case per student. */
export async function createCase(userId: number, input: CaseInput, actor: { id: number; role: Role }, now = new Date()): Promise<number> {
  if (await one("SELECT id FROM oj_cases WHERE user_id = $1", [userId])) throw new Error("This student already has a journey.");
  const tpl = await currentTemplate();
  const profile = profileOf(input);
  const consultant = Number(await val("SELECT counselor_id FROM sa_profiles WHERE user_id = $1", [userId]) ?? 0) || null;
  const id = await tx(async (c) => {
    const r = await c.query<R>(
      "INSERT INTO oj_cases (user_id, template_key, template_version, profile_json, destination, degree, intake, consultant_id, status, started_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,NOW(),NOW()) RETURNING id",
      [userId, tpl.key, tpl.version, JSON.stringify(profile), profile.destination, profile.degree, profile.intake, consultant, fmtSql(now)],
    );
    const caseId = Number(r.rows[0].id);
    const cs = mapCase((await c.query<R>("SELECT * FROM oj_cases WHERE id = $1", [caseId])).rows[0]);
    const intake = parseIntake(profile.intake);
    for (const d of tasksFor(tpl.def, profile, "case")) await insertTask(c, cs, tpl, d, null, 1, now, intake);
    await rebuildDeps(c, caseId);
    await logEvent({ caseId, actorId: actor.id, actorRole: actor.role, kind: "case.created", note: `${profile.destination.toUpperCase()} ${profile.degree} ${profile.intake}`, meta: { templateVersion: tpl.version } }, c);
    return caseId;
  });
  return id;
}

/** Generate the application-scope tasks for one application (called when it is added). */
export async function generateAppTasks(c: Conn, cs: CaseRow, appId: number, now = new Date()): Promise<number> {
  const tpl = { key: cs.templateKey, version: cs.templateVersion };
  const def = await templateVersion(tpl.key, tpl.version);
  const intake = parseIntake(cs.intake);
  const start = parseSqlSafe(cs.startedAt) ?? now;
  let n = 0;
  for (const d of tasksFor(def, cs.profile, "application")) { await insertTask(c, cs, tpl, d, appId, 1, start, intake); n += 1; }
  await rebuildDeps(c, cs.id);
  return n;
}

/** Insert recovery / reapplication tasks (an exception adds them as a new attempt). Returns the new task ids by key. */
export async function addRecoveryTasks(c: Conn, cs: CaseRow, defs: TaskDef[], attempt: number, appId: number | null, now: Date): Promise<Map<string, number>> {
  const tpl = { key: cs.templateKey, version: cs.templateVersion };
  const intake = parseIntake(cs.intake);
  const out = new Map<string, number>();
  for (const d of defs) out.set(d.key, await insertTask(c, cs, tpl, { ...d, due: { from: "start", days: d.due.from === "start" ? d.due.days : 3 + Math.max(0, d.due.days % 20) } }, appId, attempt, now, intake));
  await rebuildDeps(c, cs.id);
  return out;
}

const parseSqlSafe = (s: string): Date | null => { const d = new Date(s.replace(" ", "T") + "Z"); return Number.isNaN(d.getTime()) ? null : d; };

// ---- loading -------------------------------------------------------------------------------------------------------------------

export async function getCase(id: number): Promise<CaseRow | null> {
  const r = await one<R>("SELECT * FROM oj_cases WHERE id = $1", [id]);
  return r ? mapCase(r) : null;
}
export async function caseOfUser(userId: number): Promise<CaseRow | null> {
  const r = await one<R>("SELECT * FROM oj_cases WHERE user_id = $1", [userId]);
  return r ? mapCase(r) : null;
}

export interface Loaded { c: CaseRow; tasks: TaskRow[]; deps: Dep[]; byId: Map<number, TaskRow>; apps: AppRow[] }
export async function loadCase(caseId: number): Promise<Loaded | null> {
  const c = await getCase(caseId);
  if (!c) return null;
  const [t, d, a] = await Promise.all([
    all<R>("SELECT * FROM oj_tasks WHERE case_id = $1 ORDER BY stage, id", [caseId]),
    all<R>("SELECT d.task_id, d.depends_on, d.grp FROM oj_task_deps d JOIN oj_tasks t ON t.id = d.task_id WHERE t.case_id = $1", [caseId]),
    all<R>("SELECT * FROM oj_applications WHERE case_id = $1 ORDER BY id", [caseId]),
  ]);
  const tasks = t.map(mapTask);
  return { c, tasks, deps: d.map((x) => ({ taskId: Number(x.task_id), dependsOn: Number(x.depends_on), grp: String(x.grp) })), byId: new Map(tasks.map((x) => [x.id, x])), apps: a.map(mapApp) };
}

export async function loadTask(taskId: number): Promise<{ task: TaskRow; loaded: Loaded } | null> {
  const caseId = Number(await val("SELECT case_id FROM oj_tasks WHERE id = $1", [taskId]) ?? 0);
  if (!caseId) return null;
  const loaded = await loadCase(caseId);
  const task = loaded?.byId.get(taskId);
  return loaded && task ? { task, loaded } : null;
}

/** Evidence on a task. A document's status is the status of the newest version of that document, so a re-upload replaces a rejected one. Expired documents count as expired. */
export async function evidenceFor(taskId: number): Promise<Array<EvidenceItem & { at: string; by: number | null; docId: number | null; docVersion: number | null; docName: string | null }>> {
  const rows = await all<R>(
    `SELECT e.*, d.original_name, d.version, d.app_key,
       (SELECT d2.status FROM oj_documents d2 WHERE d2.case_id = d.case_id AND d2.doc_key = d.doc_key AND d2.app_key = d.app_key ORDER BY d2.version DESC LIMIT 1) AS live_status,
       (SELECT d2.expires_on FROM oj_documents d2 WHERE d2.case_id = d.case_id AND d2.doc_key = d.doc_key AND d2.app_key = d.app_key ORDER BY d2.version DESC LIMIT 1) AS live_expiry,
       (SELECT d2.id FROM oj_documents d2 WHERE d2.case_id = d.case_id AND d2.doc_key = d.doc_key AND d2.app_key = d.app_key ORDER BY d2.version DESC LIMIT 1) AS live_id
     FROM oj_evidence e LEFT JOIN oj_documents d ON d.id = e.doc_id WHERE e.task_id = $1 ORDER BY e.id`, [taskId]);
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    id: Number(r.id), kind: r.kind, docKey: r.doc_key ?? undefined, byRole: r.by_role as Role, text: r.text_value ?? undefined, url: r.url ?? undefined, at: String(r.created_at), by: r.by_user === null ? null : Number(r.by_user),
    docStatus: r.kind === "document" ? ((r.live_expiry && String(r.live_expiry) < today && r.live_status !== "rejected" ? "expired" : r.live_status) as EvidenceItem["docStatus"]) : undefined,
    docId: r.live_id === null || r.live_id === undefined ? (r.doc_id === null ? null : Number(r.doc_id)) : Number(r.live_id), docVersion: r.version === null ? null : Number(r.version), docName: r.original_name ?? null,
  }));
}

export async function addEvidence(e: { taskId: number; caseId: number; kind: string; docId?: number | null; docKey?: string | null; text?: string; url?: string; byRole: Role; byUser: number | null }, c: Q | null = null): Promise<void> {
  const sql = "INSERT INTO oj_evidence (task_id, case_id, kind, doc_id, doc_key, text_value, url, by_role, by_user, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())";
  const p = [e.taskId, e.caseId, e.kind, e.docId ?? null, e.docKey ?? null, e.text ? Array.from(e.text).slice(0, 2000).join("") : null, e.url ? e.url.slice(0, 500) : null, e.byRole, e.byUser];
  if (c) await c.query(sql, p);
  else await run(sql, p);
}

export async function events(caseId: number, opts: { taskId?: number; limit?: number } = {}): Promise<Array<R & { actor: string | null }>> {
  const lim = Math.trunc(opts.limit ?? 40);
  return all(`SELECT e.*, u.name AS actor FROM oj_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.case_id = $1 ${opts.taskId ? "AND e.task_id = $2" : ""} ORDER BY e.id DESC LIMIT ${lim}`, opts.taskId ? [caseId, opts.taskId] : [caseId]);
}

// ---- settings -----------------------------------------------------------------------------------------------------------------------

export interface Settings { reminderDays: number[]; consultantAfterDays: number; managerAfterDays: number; universityFollowupDays: number; reviewSlaDays: number; staleCaseDays: number }
export const DEFAULT_SETTINGS: Settings = { reminderDays: [7, 3, 1, 0], consultantAfterDays: 2, managerAfterDays: 7, universityFollowupDays: 7, reviewSlaDays: 3, staleCaseDays: 14 };

export async function settings(): Promise<Settings> {
  const r = await one<R>("SELECT v FROM oj_settings WHERE k = 'escalation'");
  if (!r) return DEFAULT_SETTINGS;
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(String(r.v)) as Partial<Settings>) }; } catch { return DEFAULT_SETTINGS; }
}
export async function saveSettings(s: Settings, adminId: number): Promise<void> {
  await run("INSERT INTO oj_settings (k, v, updated_by) VALUES ('escalation', $1, $2) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)", [JSON.stringify(s), adminId]);
}

// ---- package level (entitlements) -------------------------------------------------------------------------------------------------------

/** The highest overseas package the person has actually paid for (a verified, active entitlement), or 0. Nothing here can be granted by staff or a page. */
export async function packageLevel(userId: number): Promise<number> {
  const ents = await entitlementsFor(userId);
  const now = Date.now();
  let best = 0;
  for (const e of ents) {
    if (e.kind !== "consulting" || e.status !== "active") continue;
    if (e.expiresAt && new Date(e.expiresAt.replace(" ", "T") + "Z").getTime() < now) continue;
    const p = ABROAD_PACKAGES.find((x) => x.key === e.ref);
    if (p) best = Math.max(best, p.level);
  }
  return best;
}

/** What the student may see of the history: no staff-only notes, reminders or handover reasons. */
export async function timeline(caseId: number, limit = 12): Promise<Array<R & { actor: string | null }>> {
  return all(`SELECT e.*, u.name AS actor FROM oj_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.case_id = $1 AND e.kind IN ('status','doc.uploaded','doc.verified','doc.rejected','application.added','application.status','exception.applied','case.created','legacy.imported') ORDER BY e.id DESC LIMIT ${Math.trunc(limit)}`, [caseId]);
}

export async function consultantOf(consultantId: number | null): Promise<{ id: number; name: string; email: string } | null> {
  return consultantId ? one<{ id: number; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = $1", [consultantId]) : null;
}
