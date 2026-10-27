import { createHash } from "node:crypto";
import { z } from "zod";
import { findCycle } from "./engine";
import { DOC_KEYS, type Cond, type CaseProfile, type TaskDef, type TemplateDef } from "./types";

/** Template validation, personalisation and dependency resolution. Pure. */

const condSchema: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(condSchema) }).strict(),
    z.object({ any: z.array(condSchema) }).strict(),
    z.object({ not: condSchema }).strict(),
    z.object({ field: z.string().min(1), eq: z.union([z.string(), z.boolean()]).optional(), in: z.array(z.string()).optional() }).strict() as unknown as z.ZodType<Cond>,
  ]),
);
const evSchema = z.object({ kind: z.enum(["document", "text", "link", "confirmation"]), docKey: z.string().optional(), verified: z.boolean().optional(), by: z.enum(["student", "consultant"]).optional(), label: z.string().min(2).max(160) });
const taskSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.]{3,60}$/), stage: z.number().int().min(1).max(30), sub: z.string().min(1).max(80), title: z.string().min(3).max(200), description: z.string().max(1000),
  scope: z.enum(["case", "application"]), owner: z.enum(["student", "consultant", "university"]), priority: z.enum(["low", "normal", "high", "critical"]),
  deps: z.array(z.string()), evidence: z.array(evSchema).min(1), review: z.enum(["none", "consultant"]), criteria: z.string().min(3).max(400),
  due: z.object({ from: z.enum(["start", "intake"]), days: z.number().int().min(-1000).max(2000) }), when: condSchema.optional(),
  minLevel: z.number().int().min(1).max(5).optional(), external: z.boolean().optional(), auto: z.string().optional(), action: z.string().max(40).optional(),
});
export const templateSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{3,40}$/), name: z.string().min(3).max(120), reviewedOn: z.string(),
  stages: z.array(z.object({ no: z.number().int(), name: z.string().min(2), blurb: z.string(), track: z.boolean().optional() })).min(1),
  tasks: z.array(taskSchema).min(1), recovery: z.record(z.string(), z.array(taskSchema)),
});

export const AUTO_CHECKS = ["email_verified", "profile_complete", "shortlist_mix", "core_docs_verified"] as const;

/** Everything wrong with a template, as readable sentences. An empty list means it can be published. */
export function validateTemplate(input: unknown): { ok: true; template: TemplateDef } | { ok: false; errors: string[] } {
  const p = templateSchema.safeParse(input);
  if (!p.success) return { ok: false, errors: p.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "template"}: ${i.message}`) };
  const t = p.data as TemplateDef;
  const errors: string[] = [];
  const all = [...t.tasks, ...Object.values(t.recovery).flat()];
  const byKey = new Map<string, TaskDef>();
  for (const d of all) {
    if (byKey.has(d.key)) errors.push(`Duplicate task key ${d.key}.`);
    byKey.set(d.key, d);
  }
  const stageNos = new Set(t.stages.map((s) => s.no));
  const edges: Array<[string, string]> = [];
  for (const d of all) {
    if (!stageNos.has(d.stage)) errors.push(`${d.key}: stage ${d.stage} is not defined.`);
    for (const e of d.evidence) {
      if (e.kind === "document" && (!e.docKey || !DOC_KEYS[e.docKey])) errors.push(`${d.key}: unknown document type ${e.docKey}.`);
      if (e.kind === "confirmation" && !e.by) errors.push(`${d.key}: a confirmation needs "by".`);
    }
    if (d.auto && !(AUTO_CHECKS as readonly string[]).includes(d.auto)) errors.push(`${d.key}: unknown automatic check ${d.auto}.`);
    if (d.owner === "university" && d.review === "consultant") errors.push(`${d.key}: a university task is recorded by staff and cannot also need review.`);
    for (const raw of d.deps) {
      const k = raw.replace(/^any:/, "");
      const target = byKey.get(k);
      if (!target) { errors.push(`${d.key}: depends on unknown task ${k}.`); continue; }
      if (target.scope === "application" && d.scope === "case" && !d.deps.length) errors.push(`${d.key}: needs another dependency as well.`);
      edges.push([d.key, k]);
    }
  }
  const cyc = findCycle(edges);
  if (cyc) errors.push(`Circular dependency: ${cyc.join(" → ")}.`);
  return errors.length ? { ok: false, errors } : { ok: true, template: t };
}

export const templateHash = (t: TemplateDef): string => createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 32);

// ---- personalisation --------------------------------------------------------------------------------------------------------

export function evalCond(c: Cond | undefined, p: CaseProfile): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => evalCond(x, p));
  if ("any" in c) return c.any.some((x) => evalCond(x, p));
  if ("not" in c) return !evalCond(c.not, p);
  const v = p[c.field];
  if (c.in) return c.in.includes(String(v));
  return c.eq === undefined ? true : v === c.eq;
}

/** Tasks a case with this profile needs. Tracks (internship / part-time) appear only when the student opted in, through their `when`. */
export function tasksFor(t: TemplateDef, p: CaseProfile, scope: "case" | "application"): TaskDef[] {
  return t.tasks.filter((d) => d.scope === scope && evalCond(d.when, p));
}

export interface Instance { ref: string; key: string; scope: "case" | "application"; appId: number | null; deps: string[]; attempt?: number }
export interface Edge { from: string; to: string; grp: string }

/**
 * Turn "task X depends on key K" into edges between concrete tasks.
 * App-scope -> app-scope: the same application. App-scope -> case-scope: the one case task. Case-scope -> app-scope: every application's task, or
 * (with "any:") a group satisfied by any one of them. Dependencies on tasks this case does not have (a condition was false) simply drop away.
 */
export function resolveDeps(instances: Instance[]): Edge[] {
  const byKey = new Map<string, Instance[]>();
  for (const i of instances) byKey.set(i.key, [...(byKey.get(i.key) ?? []), i]);
  const edges: Edge[] = [];
  for (const i of instances) {
    for (const raw of i.deps) {
      const any = raw.startsWith("any:");
      const key = raw.replace(/^any:/, "");
      const targets = byKey.get(key) ?? [];
      if (!targets.length) continue;
      if (targets[0].scope === "case") {
        // A recovery task depends on its own attempt's chain; everything else waits for the latest attempt (a reapplication replaces the earlier one for everything downstream).
        const latest = [...targets].sort((a, b) => (b.attempt ?? 1) - (a.attempt ?? 1))[0];
        const mine = i.key.startsWith("rx.") ? targets.find((x) => (x.attempt ?? 1) === (i.attempt ?? 1)) ?? latest : latest;
        edges.push({ from: i.ref, to: mine.ref, grp: "" });
      }
      else if (i.scope === "application") {
        const same = targets.find((x) => x.appId === i.appId);
        if (same) edges.push({ from: i.ref, to: same.ref, grp: "" });
      } else for (const x of targets) edges.push({ from: i.ref, to: x.ref, grp: any ? `any:${key}` : "" });
    }
  }
  return edges;
}

/** What would change for an existing case if it moved from one template version to another. Nothing is applied by computing this. */
export function diffTemplates(oldT: TemplateDef, newT: TemplateDef, p: CaseProfile): { add: TaskDef[]; remove: TaskDef[]; changed: Array<{ key: string; fields: string[] }> } {
  const mine = (t: TemplateDef) => new Map(t.tasks.filter((d) => evalCond(d.when, p)).map((d) => [d.key, d]));
  const a = mine(oldT);
  const b = mine(newT);
  const add = [...b.values()].filter((d) => !a.has(d.key));
  const remove = [...a.values()].filter((d) => !b.has(d.key));
  const changed: Array<{ key: string; fields: string[] }> = [];
  for (const [k, nd] of b) {
    const od = a.get(k);
    if (!od) continue;
    const fields = (["title", "description", "priority", "owner", "review", "criteria", "minLevel"] as const).filter((f) => JSON.stringify(od[f]) !== JSON.stringify(nd[f]));
    if (JSON.stringify(od.evidence) !== JSON.stringify(nd.evidence)) fields.push("evidence" as never);
    if (JSON.stringify(od.due) !== JSON.stringify(nd.due)) fields.push("due" as never);
    if (JSON.stringify(od.deps) !== JSON.stringify(nd.deps)) fields.push("deps" as never);
    if (fields.length) changed.push({ key: k, fields });
  }
  return { add, remove, changed };
}
