import { all, one } from "../portal/db";
import { delayParty, effectiveStatus, isOverdue, overdueDays, parseSql } from "./engine";
import { buildView } from "./service";
import { loadCase, packageLevel } from "./store";
import { STATUS_LABEL } from "./types";

/**
 * Analytics computed from real rows only. Nothing is estimated or filled in: with no cases every figure is zero and the page says so. Rates over a
 * small group are withheld (MIN_COHORT) so one person's journey is not exposed or over-read.
 */
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const MIN_COHORT = 5;

const pct = (a: number, b: number): number | null => (b < MIN_COHORT ? null : Math.round((a / b) * 100));

export interface StageStat { stage: number; total: number; done: number; completionPct: number | null; avgTurnaroundDays: number | null; medianOverdueDays: number | null; cases: number }
export interface Analytics {
  generatedAt: string; cases: { active: number; deferred: number; withdrawn: number; completed: number; total: number };
  stages: StageStat[];
  funnel: Array<{ label: string; count: number; ofPrev: number | null }>;
  delay: { student: number; consultant: number; university: number; total: number };
  atRisk: { high: number; watch: number; total: number };
  workload: Array<{ consultantId: number; name: string; cases: number; openTasks: number; overdue: number; inReview: number; avgReviewWaitDays: number | null }>;
  bottlenecks: Array<{ taskKey: string; title: string; stage: number; open: number; overdue: number; avgDaysOpen: number }>;
  byDestination: Array<{ destination: string; cases: number; avgProgressPct: number | null }>;
  enough: boolean;
}

export async function compute(now = new Date()): Promise<Analytics> {
  const counts = await all<R>("SELECT status, COUNT(*) AS n FROM oj_cases GROUP BY status");
  const cc = (s: string) => Number(counts.find((r) => r.status === s)?.n ?? 0);
  const casesTotal = counts.reduce((a, r) => a + Number(r.n), 0);

  const stageRows = await all<R>(
    `SELECT t.stage, COUNT(*) AS total, SUM(t.status = 'completed') AS done, COUNT(DISTINCT t.case_id) AS cases,
       AVG(CASE WHEN t.status = 'completed' AND t.completed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, t.created_at, t.completed_at) / 24 END) AS turn
     FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE t.obsolete = 0 AND t.status <> 'not_applicable' AND c.status IN ('active','deferred','completed') GROUP BY t.stage ORDER BY t.stage`);
  const cohortOf = (stage: number) => Number(stageRows.find((r) => Number(r.stage) === stage)?.cases ?? 0);
  const stages: StageStat[] = stageRows.map((r) => ({
    stage: Number(r.stage), total: Number(r.total), done: Number(r.done), cases: Number(r.cases), completionPct: Number(r.cases) < MIN_COHORT || !Number(r.total) ? null : Math.round((Number(r.done) / Number(r.total)) * 100),
    avgTurnaroundDays: r.turn === null || Number(r.cases) < MIN_COHORT ? null : Math.round(Number(r.turn) * 10) / 10, medianOverdueDays: null,
  }));
  void cohortOf;

  // Funnel: each step counts cases that really reached it, from stored facts.
  const f = async (sql: string) => Number((await one<R>(sql))?.n ?? 0);
  const started = casesTotal;
  const steps: Array<[string, number]> = [
    ["Journeys started", started],
    ["Shortlist approved", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_tasks WHERE task_key = 's3.approve' AND status = 'completed'")],
    ["At least one application submitted", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_applications WHERE status IN ('submitted','under_review','offer','accepted','declined','rejected','waitlisted') AND submitted_at IS NOT NULL")],
    ["At least one offer", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_tasks WHERE task_key = 's7a.decision' AND status = 'completed'")],
    ["Offer accepted", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_applications WHERE status = 'accepted'")],
    ["Visa granted (recorded with proof)", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_tasks WHERE task_key = 's10.decision' AND status = 'completed'")],
    ["Arrived", await f("SELECT COUNT(DISTINCT case_id) AS n FROM oj_tasks WHERE task_key = 's12.arrived' AND status = 'completed'")],
  ];
  const funnel = steps.map(([label, count], i) => ({ label, count, ofPrev: i === 0 ? null : pct(count, steps[i - 1][1]) }));

  // Delay attribution and risk are computed per open case from the live tasks.
  const open = await all<R>("SELECT id FROM oj_cases WHERE status IN ('active','deferred')");
  const delay = { student: 0, consultant: 0, university: 0, total: 0 };
  const atRisk = { high: 0, watch: 0, total: 0 };
  const byTask = new Map<string, { title: string; stage: number; open: number; overdue: number; days: number }>();
  const dest = new Map<string, { n: number; pct: number }>();
  const perConsultant = new Map<number, { overdue: number }>();
  for (const row of open) {
    const l = await loadCase(Number(row.id));
    if (!l) continue;
    const v = buildView(l, await packageLevel(l.c.userId), now);
    atRisk.total += 1;
    if (v.risk.level === "high") atRisk.high += 1;
    else if (v.risk.level === "watch") atRisk.watch += 1;
    const d = dest.get(l.c.destination) ?? { n: 0, pct: 0 };
    d.n += 1; d.pct += v.progress.pct; dest.set(l.c.destination, d);
    for (const t of v.tasks) {
      if (t.ent.locked || ["completed", "not_applicable"].includes(t.task.status)) continue;
      const cur = byTask.get(t.task.taskKey) ?? { title: t.task.title.replace(/ \(new application\)$/, ""), stage: t.task.stage, open: 0, overdue: 0, days: 0 };
      cur.open += 1;
      cur.days += Math.max(0, (now.getTime() - parseSql(t.task.createdAt).getTime()) / 86_400_000);
      if (t.overdue) {
        cur.overdue += 1;
        delay[t.party] += overdueDays(t.task, now);
        delay.total += overdueDays(t.task, now);
        if (l.c.consultantId && t.party === "consultant") perConsultant.set(l.c.consultantId, { overdue: (perConsultant.get(l.c.consultantId)?.overdue ?? 0) + 1 });
      }
      byTask.set(t.task.taskKey, cur);
    }
  }
  const workloadRows = await all<R>(
    `SELECT u.id, u.name, (SELECT COUNT(*) FROM oj_cases c WHERE c.consultant_id = u.id AND c.status IN ('active','deferred')) AS cases,
       (SELECT COUNT(*) FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE c.consultant_id = u.id AND c.status IN ('active','deferred') AND t.obsolete = 0 AND t.owner_role = 'consultant' AND t.status NOT IN ('completed','not_applicable')) AS open_n,
       (SELECT COUNT(*) FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE c.consultant_id = u.id AND t.obsolete = 0 AND t.status = 'submitted_for_review') AS in_review,
       (SELECT AVG(TIMESTAMPDIFF(HOUR, t.submitted_at, UTC_TIMESTAMP()) / 24) FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE c.consultant_id = u.id AND t.obsolete = 0 AND t.status = 'submitted_for_review' AND t.submitted_at IS NOT NULL) AS wait
     FROM users u WHERE u.role = 'counselor' ORDER BY cases DESC, u.name`);
  const workload = workloadRows.map((r) => ({ consultantId: Number(r.id), name: r.name, cases: Number(r.cases), openTasks: Number(r.open_n), overdue: perConsultant.get(Number(r.id))?.overdue ?? 0, inReview: Number(r.in_review), avgReviewWaitDays: r.wait === null ? null : Math.round(Number(r.wait) * 10) / 10 }));
  const bottlenecks = [...byTask.entries()].filter(([, v]) => v.overdue >= 1 && v.open >= 3).sort((a, b) => b[1].overdue - a[1].overdue || b[1].days / b[1].open - a[1].days / a[1].open).slice(0, 8)
    .map(([k, v]) => ({ taskKey: k, title: v.title, stage: v.stage, open: v.open, overdue: v.overdue, avgDaysOpen: Math.round((v.days / v.open) * 10) / 10 }));
  const byDestination = [...dest.entries()].map(([destination, v]) => ({ destination, cases: v.n, avgProgressPct: v.n >= MIN_COHORT ? Math.round(v.pct / v.n) : null })).sort((a, b) => b.cases - a.cases);
  return {
    generatedAt: now.toISOString(), cases: { active: cc("active"), deferred: cc("deferred"), withdrawn: cc("withdrawn"), completed: cc("completed"), total: casesTotal },
    stages, funnel, delay, atRisk, workload, bottlenecks, byDestination, enough: casesTotal >= MIN_COHORT,
  };
}

export { STATUS_LABEL, effectiveStatus, delayParty, isOverdue };
