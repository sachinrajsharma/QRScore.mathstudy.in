import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATE } from "./default-template";
import { blockInfo, canApproveNa, checkTransition, computeDue, delayParty, effectiveStatus, entitlementFor, evidenceGaps, findCycle, intakeRisk, isOverdue, nextActions, parseIntake, progress, type Actor, type Dep } from "./engine";
import { diffTemplates, evalCond, resolveDeps, tasksFor, validateTemplate, type Instance } from "./template";
import type { CaseProfile, EvidenceItem, Status, TaskRow } from "./types";

const profile: CaseProfile = { destination: "uk", degree: "PG", intake: "Fall 2027", visaRoute: "student", englishExempt: false, entranceTestNeeded: false, needsFunding: true, needsLoan: true, wantsScholarship: false, needsAccommodation: true, hasWorkExperience: true, hasStudyGap: false, portfolioNeeded: false, wantsInternship: false, wantsPartTime: false };
let seq = 0;
const task = (o: Partial<TaskRow> = {}): TaskRow => ({
  id: ++seq, caseId: 1, applicationId: null, templateKey: "t", templateVersion: 1, taskKey: "k" + seq, stage: 1, sub: "s", title: "Task " + seq, description: "", owner: "student", ownerUserId: null, priority: "normal", status: "not_started",
  dueAt: "2027-01-10 23:59:59", review: "none", criteria: "", evidenceReq: [{ kind: "text", label: "A note" }], minLevel: null, external: false, auto: null, action: "", blockedReason: "", naReason: "", naRequestedBy: null, naApprovedBy: null,
  startedAt: null, submittedAt: null, completedAt: null, completedBy: null, createdAt: "2026-10-01 00:00:00", updatedAt: "2026-10-01 00:00:00", obsolete: false, attempt: 1, ...o,
});
const student: Actor = { role: "student", id: 1, permitted: true };
const staff: Actor = { role: "counselor", id: 2, permitted: true };
const admin: Actor = { role: "admin", id: 3, permitted: true };
const txt = (t = "did it"): EvidenceItem[] => [{ kind: "text", text: t, byRole: "student" }];

describe("template", () => {
  it("is valid, acyclic and has 100+ tasks across 12 stages plus 2 tracks", () => {
    const v = validateTemplate(JSON.parse(JSON.stringify(BUILTIN_TEMPLATE)));
    expect(v.ok ? [] : v.errors).toEqual([]);
    expect(BUILTIN_TEMPLATE.tasks.length).toBeGreaterThanOrEqual(100);
    expect(new Set(BUILTIN_TEMPLATE.tasks.map((t) => t.stage))).toEqual(new Set(Array.from({ length: 14 }, (_, i) => i + 1)));
    for (const t of BUILTIN_TEMPLATE.tasks) { expect(t.evidence.length).toBeGreaterThan(0); expect(t.criteria.length).toBeGreaterThan(3); expect(t.due.days).not.toBeNaN(); }
  });
  it("rejects unknown dependencies, cycles and unknown evidence", () => {
    const bad = JSON.parse(JSON.stringify(BUILTIN_TEMPLATE));
    bad.tasks[0].deps = ["nope.none"];
    bad.tasks[1].deps = [bad.tasks[2].key]; bad.tasks[2].deps = [bad.tasks[1].key];
    const r = validateTemplate(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errors.join(" ")).toMatch(/unknown task/); expect(r.errors.join(" ")).toMatch(/Circular/); }
  });
  it("personalises by destination, degree, tests, funding, accommodation and tracks", () => {
    const keys = (p: CaseProfile) => new Set(tasksFor(BUILTIN_TEMPLATE, p, "case").map((t) => t.key));
    const uk = keys(profile);
    expect(uk.has("s10.cas")).toBe(true); expect(uk.has("s10.ds160")).toBe(false); expect(uk.has("s9.loan_apply")).toBe(true); expect(uk.has("s9.accom_booked")).toBe(true); expect(uk.has("s2.work_exp")).toBe(true);
    expect(uk.has("s13.rights")).toBe(false); expect(uk.has("s5.english_taken")).toBe(true);
    const us = keys({ ...profile, destination: "usa", degree: "UG", englishExempt: true, needsLoan: false, needsAccommodation: false, hasWorkExperience: false, entranceTestNeeded: true, wantsInternship: true, wantsPartTime: true });
    expect(us.has("s10.ds160")).toBe(true); expect(us.has("s10.cas")).toBe(false); expect(us.has("s5.english_taken")).toBe(false); expect(us.has("s2.english_exempt")).toBe(true); expect(us.has("s9.loan_apply")).toBe(false);
    expect(us.has("s9.accom_booked")).toBe(false); expect(us.has("s5.entrance_taken")).toBe(true); expect(us.has("s13.offer")).toBe(true); expect(us.has("s14.hours")).toBe(true); expect(us.has("s4.degree")).toBe(false);
    expect(keys({ ...profile, destination: "germany" }).has("s9.blocked_account")).toBe(true);
    expect(evalCond({ not: { field: "degree", eq: "UG" } }, profile)).toBe(true);
  });
  it("resolves per-application dependencies independently", () => {
    const inst: Instance[] = [
      { ref: "s3.approve", key: "s3.approve", scope: "case", appId: null, deps: [] },
      { ref: "a@1", key: "s4a.checklist", scope: "application", appId: 1, deps: ["s3.approve"] }, { ref: "a@2", key: "s4a.checklist", scope: "application", appId: 2, deps: ["s3.approve"] },
      { ref: "x@1", key: "s4a.extra", scope: "application", appId: 1, deps: ["s4a.checklist"] }, { ref: "x@2", key: "s4a.extra", scope: "application", appId: 2, deps: ["s4a.checklist"] },
      { ref: "all", key: "s6.all", scope: "case", appId: null, deps: ["s4a.extra"] }, { ref: "any", key: "s8.cmp", scope: "case", appId: null, deps: ["any:s4a.extra"] },
    ];
    const e = resolveDeps(inst);
    expect(e).toContainEqual({ from: "x@1", to: "a@1", grp: "" });
    expect(e).not.toContainEqual({ from: "x@1", to: "a@2", grp: "" });
    expect(e.filter((x) => x.from === "all").map((x) => x.to).sort()).toEqual(["x@1", "x@2"]);
    expect(e.filter((x) => x.from === "any").every((x) => x.grp === "any:s4a.extra")).toBe(true);
  });
  it("diffs template versions without applying anything", () => {
    const v2 = JSON.parse(JSON.stringify(BUILTIN_TEMPLATE));
    v2.tasks.push({ ...v2.tasks[0], key: "s1.new_thing", title: "New" });
    v2.tasks = v2.tasks.filter((t: { key: string }) => t.key !== "s1.goals");
    v2.tasks.find((t: { key: string }) => t.key === "s1.budget").priority = "high";
    const d = diffTemplates(BUILTIN_TEMPLATE, v2, profile);
    expect(d.add.map((t) => t.key)).toEqual(["s1.new_thing"]);
    expect(d.remove.map((t) => t.key)).toEqual(["s1.goals"]);
    expect(d.changed).toEqual([{ key: "s1.budget", fields: ["priority"] }]);
  });
});

describe("dates and overdue", () => {
  it("parses intakes", () => {
    expect(parseIntake("Fall 2027")?.toISOString().slice(0, 10)).toBe("2027-09-01");
    expect(parseIntake("Spring 2028")?.toISOString().slice(0, 10)).toBe("2028-01-15");
    expect(parseIntake("Sep 2027")?.toISOString().slice(0, 10)).toBe("2027-09-01");
    expect(parseIntake("Not sure yet")).toBeNull();
  });
  it("always yields a due date, and never before the start", () => {
    const start = new Date("2026-10-27T00:00:00Z");
    expect(computeDue({ from: "start", days: 7 }, start, null, 1).toISOString()).toBe("2026-11-03T23:59:59.000Z");
    expect(computeDue({ from: "intake", days: -210 }, start, new Date("2027-09-01T00:00:00Z"), 4).toISOString().slice(0, 10)).toBe("2027-02-03");
    expect(computeDue({ from: "intake", days: -210 }, start, null, 4).getTime()).toBeGreaterThan(start.getTime());
    expect(computeDue({ from: "intake", days: -210 }, start, new Date("2026-12-01T00:00:00Z"), 4).getTime()).toBeGreaterThan(start.getTime());
  });
  it("overdue is calculated: past due and not done; waiting on university stays overdue but is the university's delay", () => {
    const now = new Date("2027-02-01T00:00:00Z");
    expect(isOverdue(task({ dueAt: "2027-01-10 23:59:59" }), now)).toBe(true);
    expect(isOverdue(task({ dueAt: "2027-02-01 23:59:59" }), now)).toBe(false);
    for (const s of ["completed", "not_applicable"] as Status[]) expect(isOverdue(task({ status: s }), now)).toBe(false);
    for (const s of ["in_progress", "blocked", "waiting_on_university", "submitted_for_review"] as Status[]) expect(isOverdue(task({ status: s }), now)).toBe(true);
    expect(isOverdue(task({ dueAt: null }), now)).toBe(false);
    const w = task({ status: "waiting_on_university" });
    expect(delayParty(w, [], new Map([[w.id, w]]))).toBe("university");
    const r = task({ status: "submitted_for_review" });
    expect(delayParty(r, [], new Map([[r.id, r]]))).toBe("consultant");
    const mine = task({ status: "in_progress" });
    expect(delayParty(mine, [], new Map([[mine.id, mine]]))).toBe("student");
  });
});

describe("dependencies", () => {
  it("blocks with an explanation and how to unblock; N/A and completion unblock", () => {
    const a = task({ title: "Upload passport", status: "in_progress" });
    const b = task({ title: "Check validity", owner: "consultant" });
    const c = task({ title: "Book test" });
    const deps: Dep[] = [{ taskId: b.id, dependsOn: a.id, grp: "" }, { taskId: c.id, dependsOn: b.id, grp: "" }];
    const m = new Map([a, b, c].map((t) => [t.id, t]));
    expect(effectiveStatus(a, deps, m)).toBe("in_progress");
    expect(effectiveStatus(b, deps, m)).toBe("blocked");
    const info = blockInfo(b, deps, m);
    expect(info.kind).toBe("dependency"); expect(info.reason).toContain("Upload passport"); expect(info.blockers[0].howToUnblock).toContain("Finish");
    expect(blockInfo(b, deps, m, "staff").blockers[0].howToUnblock).toContain("student must finish");
    expect(blockInfo(c, deps, m).blockers[0].howToUnblock).toContain("consultant will complete");
    expect(delayParty(c, deps, m)).toBe("student"); // c's blocker b is blocked by the student's own task a
    a.status = "not_applicable";
    expect(effectiveStatus(b, deps, m)).toBe("ready_to_start");
  });
  it("blame follows the blocker, and 'any' groups need only one", () => {
    const up = task({ owner: "consultant", status: "in_progress" });
    const down = task({});
    const m = new Map([up, down].map((t) => [t.id, t]));
    expect(delayParty(down, [{ taskId: down.id, dependsOn: up.id, grp: "" }], m)).toBe("consultant");
    const o1 = task({ title: "Offer A" }); const o2 = task({ title: "Offer B", status: "completed" }); const cmp = task({});
    const g: Dep[] = [o1, o2].map((o) => ({ taskId: cmp.id, dependsOn: o.id, grp: "any:offer" }));
    const m2 = new Map([o1, o2, cmp].map((t) => [t.id, t]));
    expect(blockInfo(cmp, g, m2).blocked).toBe(false);
    o2.status = "in_progress";
    expect(blockInfo(cmp, g, m2).blocked).toBe(true);
  });
  it("manual blocks keep their reason; cycles are found", () => {
    const t = task({ status: "blocked", blockedReason: "Waiting for passport renewal" });
    const info = blockInfo(t, [], new Map([[t.id, t]]));
    expect(info).toMatchObject({ blocked: true, kind: "manual", reason: "Waiting for passport renewal" });
    expect(findCycle([["a", "b"], ["b", "c"], ["c", "a"]])).toEqual(["a", "b", "c", "a"]);
    expect(findCycle([["a", "b"], ["b", "c"]])).toBeNull();
  });
});

describe("status transitions and completion", () => {
  const run = (t: TaskRow, to: Status, actor: Actor, note = "", items: EvidenceItem[] = [], effective?: Status) => checkTransition({ task: t, effective: effective ?? (t.status === "not_started" ? "ready_to_start" : t.status), to, actor, note, items });
  it("a task cannot complete without evidence and a note, however it is reached", () => {
    const x = task({ status: "in_progress" });
    expect(run(x, "completed", student, "", [])).toMatchObject({ ok: false });
    expect(run(x, "completed", student, "done", [])).toMatchObject({ ok: false }); // the note is not the text evidence
  });
  it("text evidence is separate from the note", () => {
    const x = task({ status: "in_progress", evidenceReq: [{ kind: "document", docKey: "cv", label: "CV" }] });
    expect(run(x, "completed", student, "done", [])).toMatchObject({ ok: false });
    expect(run(x, "completed", student, "done", [{ kind: "document", docKey: "cv", docStatus: "uploaded", byRole: "student" }])).toEqual({ ok: true });
    expect(run(task({ status: "ready_to_start" }), "completed", student, "done", txt())).toMatchObject({ ok: false, error: expect.stringMatching(/Start the task/) });
  });
  it("students cannot complete reviewed tasks, self-approve, or touch consultant tasks", () => {
    const rv = task({ status: "in_progress", review: "consultant", evidenceReq: [{ kind: "document", docKey: "sop", label: "SOP" }] });
    expect(run(rv, "completed", student, "done", [])).toMatchObject({ ok: false, error: expect.stringMatching(/consultant/) });
    expect(run(rv, "submitted_for_review", student, "", [])).toMatchObject({ ok: false });
    expect(run(rv, "submitted_for_review", student, "", [{ kind: "document", docKey: "sop", docStatus: "uploaded", byRole: "student" }])).toEqual({ ok: true });
    expect(run(task({ owner: "consultant", status: "in_progress" }), "completed", student, "x", txt())).toMatchObject({ ok: false });
    expect(run(task({ status: "submitted_for_review", review: "consultant" }), "in_progress", student)).toMatchObject({ ok: false });
    expect(run(task({ status: "in_progress" }), "blocked", student, "because")).toMatchObject({ ok: false });
  });
  it("review flow: approve needs verified docs; changes need a note; rejected docs do not count", () => {
    const rv = task({ status: "submitted_for_review", review: "consultant", evidenceReq: [{ kind: "document", docKey: "passport", verified: true, label: "Passport (verified)" }] });
    const up: EvidenceItem = { kind: "document", docKey: "passport", docStatus: "uploaded", byRole: "student" };
    expect(run(rv, "completed", staff, "looks good", [up])).toMatchObject({ ok: false });
    expect(run(rv, "completed", staff, "looks good", [{ ...up, docStatus: "verified" }])).toEqual({ ok: true });
    expect(run(rv, "completed", staff, "looks good", [{ ...up, docStatus: "rejected" }])).toMatchObject({ ok: false });
    expect(run(rv, "changes_requested", staff, "")).toMatchObject({ ok: false });
    expect(run(rv, "changes_requested", staff, "Photo is blurred, re-scan")).toEqual({ ok: true });
  });
  it("blocked/waiting need reasons; completed only reopens with a reason; N/A is not a transition", () => {
    const x = task({ status: "in_progress" });
    expect(run(x, "blocked", staff, "")).toMatchObject({ ok: false });
    expect(run(x, "blocked", staff, "Passport expired")).toEqual({ ok: true });
    expect(run(x, "waiting_on_university", staff, "Asked for a reply")).toEqual({ ok: true });
    expect(run(x, "waiting_on_student", staff, "Need new scan")).toEqual({ ok: true });
    const d = task({ status: "completed" });
    expect(run(d, "in_progress", staff, "")).toMatchObject({ ok: false });
    expect(run(d, "in_progress", staff, "Wrong document was approved")).toEqual({ ok: true });
    expect(run(x, "not_applicable", admin, "no")).toMatchObject({ ok: false });
    expect(run(x, "ready_to_start", staff)).toMatchObject({ ok: false });
  });
  it("unassigned staff are refused; dependency-blocked tasks cannot start", () => {
    expect(run(task({ status: "in_progress" }), "completed", { role: "counselor", id: 9, permitted: false }, "ok", txt())).toMatchObject({ ok: false, error: expect.stringMatching(/not assigned/) });
    expect(run(task({}), "in_progress", student, "", [], "blocked")).toMatchObject({ ok: false });
  });
  it("N/A needs a different, sufficiently senior approver", () => {
    expect(canApproveNa("student", 1, student)).toMatchObject({ ok: false });
    expect(canApproveNa("student", 1, staff)).toEqual({ ok: true });
    expect(canApproveNa("counselor", 2, staff)).toMatchObject({ ok: false });
    expect(canApproveNa("counselor", 2, admin)).toEqual({ ok: true });
    expect(canApproveNa("admin", 3, admin)).toMatchObject({ ok: false });
    expect(canApproveNa("student", 1, { ...staff, permitted: false })).toMatchObject({ ok: false });
  });
});

describe("evidence", () => {
  it("checks each requirement kind", () => {
    const reqs = [{ kind: "link", label: "Link" }, { kind: "confirmation", by: "consultant", label: "C" }, { kind: "text", label: "T" }] as never;
    expect(evidenceGaps(reqs, [], "complete")).toHaveLength(3);
    const ok: EvidenceItem[] = [{ kind: "link", url: "https://example.com/x", byRole: "student" }, { kind: "confirmation", text: "confirmed call", byRole: "counselor" }, { kind: "text", text: "notes", byRole: "student" }];
    expect(evidenceGaps(reqs, ok, "complete")).toHaveLength(0);
    expect(evidenceGaps(reqs, [{ kind: "link", url: "javascript:alert(1)", byRole: "student" }], "complete").map((g) => g.label)).toContain("Link");
    expect(evidenceGaps([{ kind: "confirmation", by: "consultant", label: "C" }] as never, [{ kind: "confirmation", text: "I did it", byRole: "student" }], "complete")).toHaveLength(1);
  });
});

describe("progress, next actions, entitlements, risk", () => {
  it("progress excludes N/A, obsolete and locked, and reports per stage", () => {
    const p = progress([{ stage: 1, status: "completed", obsolete: false }, { stage: 1, status: "in_progress", obsolete: false }, { stage: 1, status: "not_applicable", obsolete: false }, { stage: 2, status: "completed", obsolete: false }, { stage: 2, status: "completed", obsolete: true }, { stage: 2, status: "not_started", obsolete: false, locked: true }]);
    expect(p).toMatchObject({ total: 3, done: 2, pct: 67 });
    expect(p.stages).toEqual([{ stage: 1, total: 2, done: 1, pct: 50 }, { stage: 2, total: 1, done: 1, pct: 100 }]);
    expect(progress([]).pct).toBe(0);
  });
  it("next actions put overdue first, then priority, and skip blocked and others' tasks", () => {
    const now = new Date("2027-01-20T00:00:00Z");
    const late = task({ title: "late", dueAt: "2027-01-10 23:59:59", priority: "low" });
    const crit = task({ title: "crit", dueAt: "2027-03-01 23:59:59", priority: "critical" });
    const norm = task({ title: "norm", dueAt: "2027-02-01 23:59:59" });
    const mine = task({ title: "consultant's", owner: "consultant" });
    const blocked = task({ title: "blocked" });
    const dep = task({ title: "dep", status: "in_progress", owner: "consultant" });
    const r = nextActions([norm, crit, late, mine, blocked, dep], [{ taskId: blocked.id, dependsOn: dep.id, grp: "" }], now);
    expect(r.map((x) => x.task.title)).toEqual(["late", "crit", "norm"]);
  });
  it("locks staff-delivered tasks above the paid package, never critical or student-owned ones", () => {
    expect(entitlementFor({ minLevel: 4, priority: "normal", owner: "consultant" }, 1)).toMatchObject({ locked: true, needs: "End-to-End Global Success" });
    expect(entitlementFor({ minLevel: 4, priority: "normal", owner: "consultant" }, 4).locked).toBe(false);
    expect(entitlementFor({ minLevel: 4, priority: "critical", owner: "consultant" }, 0).locked).toBe(false);
    expect(entitlementFor({ minLevel: 5, priority: "normal", owner: "student" }, 0).locked).toBe(false);
    expect(entitlementFor({ minLevel: null, priority: "normal", owner: "consultant" }, 0).locked).toBe(false);
  });
  it("flags intake risk from time left, progress and overdue critical tasks", () => {
    const start = new Date("2026-10-01T00:00:00Z");
    const base = { intake: new Date("2027-03-01T00:00:00Z"), start, now: new Date("2027-01-15T00:00:00Z"), overdueStudent: 0, overdueAll: 0, criticalOverdue: 0 };
    expect(intakeRisk({ ...base, pct: 10 }).level).toBe("high");
    expect(intakeRisk({ ...base, pct: 85 }).level).toBe("none");
    expect(intakeRisk({ ...base, pct: 85, criticalOverdue: 1 }).level).toBe("high");
    expect(intakeRisk({ ...base, pct: 85, overdueStudent: 3 }).level).toBe("watch");
    expect(intakeRisk({ ...base, intake: null, pct: 5 }).level).toBe("none");
    expect(intakeRisk({ ...base, now: new Date("2027-04-01T00:00:00Z"), pct: 90 }).level).toBe("high");
  });
});
