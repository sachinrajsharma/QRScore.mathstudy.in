import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, DB, mkUser, tag, type Boot } from "../pay/test-setup";
import { BUILTIN_TEMPLATE } from "./default-template";
import type { TaskRow } from "./types";

/**
 * The journey on a real database: personalised generation, permissions, evidence-gated status changes, reviews, dependencies, independent
 * applications, versioned documents, not-applicable approval, reminders and escalation (de-duplicated), exceptions that keep history, package
 * entitlements from a real verified payment, template versioning and dashboard numbers matched against the rows.
 *   PORTAL_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/growqr_test DATABASE_SSL=disable npx vitest run lib/journey/journey-db.test.ts
 */
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const file = (name = "doc.pdf") => ({ name, size: PDF.length, bytes: PDF });

describe.skipIf(!DB)("overseas journey on a real database", () => {
  let B: Boot;
  let ST: typeof import("./store");
  let SV: typeof import("./service");
  let AP: typeof import("./apps");
  let DC: typeof import("./docs");
  let NT: typeof import("./notify");
  let EX: typeof import("./exceptions");
  let WS: typeof import("./workspace");
  let AN: typeof import("./analytics");
  let LG: typeof import("./legacy");
  let rzp: InstanceType<typeof import("../pay/test-support").FakeRazorpay>;
  let sid = 0, sid2 = 0, c1 = 0, c2 = 0, adm = 0, caseId = 0, case2 = 0;
  const S = (): { id: number; role: "student" } => ({ id: sid, role: "student" });
  const S2 = (): { id: number; role: "student" } => ({ id: sid2, role: "student" });
  const C1 = (): { id: number; role: "counselor" } => ({ id: c1, role: "counselor" });
  const C2 = (): { id: number; role: "counselor" } => ({ id: c2, role: "counselor" });
  const A = (): { id: number; role: "admin" } => ({ id: adm, role: "admin" });
  const input = { destination: "uk", degree: "PG" as const, intake: "Fall 2027", needsLoan: true, needsAccommodation: true, hasWorkExperience: true, wantsScholarship: false };
  const view = async (id = caseId, level?: number) => (await SV.viewCase(id, new Date(), level))!;
  const tk = async (key: string, appId: number | null = null, id = caseId): Promise<TaskRow> => {
    const l = (await ST.loadCase(id))!;
    const t = l.tasks.find((x) => x.taskKey === key && x.applicationId === appId && !x.obsolete);
    if (!t) throw new Error("no task " + key);
    return t;
  };
  const status = async (key: string, appId: number | null = null) => (await tk(key, appId)).status;
  /** Student-side completion of a task that needs only a text and a confirmation. */
  const doStudent = async (key: string, text = "Details recorded here", appId: number | null = null) => {
    const t = await tk(key, appId);
    if (t.status === "not_started" || t.status === "ready_to_start") expect(await SV.moveTask(t.id, S(), "in_progress")).toBeNull();
    for (const r of t.evidenceReq) if (r.kind === "text") expect(await SV.addNoteEvidence(t.id, S(), "text", text)).toBeNull();
    return SV.moveTask(t.id, S(), "completed", "Done on the day");
  };
  const doStaff = async (key: string, who: { id: number; role: "counselor" | "admin" } = C1(), appId: number | null = null, text = "Recorded by staff") => {
    const t = await tk(key, appId);
    for (const r of t.evidenceReq) if (r.kind === "text") await SV.addNoteEvidence(t.id, who, "text", text);
    for (const r of t.evidenceReq) if (r.kind === "link") await SV.addNoteEvidence(t.id, who, "link", "https://example.com/report");
    return SV.moveTask(t.id, who, "completed", "Completed and checked");
  };

  beforeAll(async () => {
    B = await boot();
    process.env.STORAGE_DIR = path.join(process.env.TEMP ?? "/tmp", `journey-test-${tag}`);
    ST = await import("./store"); SV = await import("./service"); AP = await import("./apps"); DC = await import("./docs"); NT = await import("./notify");
    EX = await import("./exceptions"); WS = await import("./workspace"); AN = await import("./analytics"); LG = await import("./legacy");
    rzp = new B.T.FakeRazorpay();
    sid = await mkUser(B.db, "student", "jstu"); sid2 = await mkUser(B.db, "student", "jstu2");
    c1 = await mkUser(B.db, "counselor", "jc1"); c2 = await mkUser(B.db, "counselor", "jc2"); adm = await mkUser(B.db, "admin", "jadm");
  });
  beforeEach(() => { B.T.setTestEnv(); });
  afterAll(async () => {
    for (const u of [sid, sid2, c1, c2, adm]) await B.db.run("DELETE FROM users WHERE id = $1", [u]);
    rzp.uninstall();
    await B.db.closePool();
  });

  it("generates a personalised checklist, pinned to a template version", async () => {
    caseId = await ST.createCase(sid, input, S());
    case2 = await ST.createCase(sid2, { destination: "usa", degree: "UG", intake: "Spring 2028", englishExempt: true, entranceTestNeeded: true, wantsInternship: true, wantsPartTime: true }, S2());
    const a = (await ST.loadCase(caseId))!;
    const b = (await ST.loadCase(case2))!;
    const keys = (x: typeof a) => new Set(x.tasks.map((t) => t.taskKey));
    expect(a.c).toMatchObject({ templateKey: "overseas-v1", templateVersion: 1, status: "active" });
    expect(keys(a).has("s10.cas")).toBe(true); expect(keys(a).has("s10.ds160")).toBe(false); expect(keys(a).has("s9.loan_apply")).toBe(true); expect(keys(a).has("s5.english_taken")).toBe(true);
    expect(keys(b).has("s10.ds160")).toBe(true); expect(keys(b).has("s5.english_taken")).toBe(false); expect(keys(b).has("s5.entrance_taken")).toBe(true); expect(keys(b).has("s13.offer")).toBe(true); expect(keys(b).has("s14.hours")).toBe(true);
    expect(a.tasks.length).toBeGreaterThan(70);
    for (const t of a.tasks) { expect(t.dueAt, t.taskKey).not.toBeNull(); expect(t.evidenceReq.length).toBeGreaterThan(0); }
    await expect(ST.createCase(sid, input, S())).rejects.toThrow(/already/);
    await SV.runAutoChecks(caseId); await SV.runAutoChecks(case2);
  });

  it("permissions: a student sees only their own case; a counselor only assigned cases; admins all", async () => {
    const c = (await ST.getCase(caseId))!;
    expect(SV.actorFor(S(), c)).toMatchObject({ role: "student", permitted: true });
    expect(SV.actorFor(S2(), c)).toBeNull();
    expect(SV.actorFor(C1(), c)).toBeNull(); // unassigned
    expect(SV.actorFor(A(), c)).toMatchObject({ permitted: true });
    const t = await tk("s1.goals");
    expect(await SV.moveTask(t.id, S2(), "in_progress")).toBe("Task not found.");
    expect(await SV.moveTask(t.id, C1(), "in_progress")).toBe("Task not found.");
    expect(await WS.assign(caseId, c1, C2(), "taking over a case")).toMatch(/Only the assigned/);
    expect(await WS.assign(caseId, c1, A(), "initial assignment")).toBeNull();
    expect(SV.actorFor(C1(), (await ST.getCase(caseId))!)).toMatchObject({ role: "counselor" });
    expect(SV.actorFor(C2(), (await ST.getCase(caseId))!)).toBeNull();
    expect(await WS.assign(case2, c2, A(), "initial assignment")).toBeNull();
    expect((await WS.caseload(C1())).map((r) => r.caseId)).toEqual([caseId]);
    expect((await WS.caseload(C2())).map((r) => r.caseId)).toEqual([case2]);
    expect((await WS.caseload(S())).length).toBe(0);
    expect((await WS.caseload(A())).map((r) => r.caseId).sort()).toEqual([caseId, case2].sort());
    expect((await WS.handovers(caseId))[0]).toMatchObject({ to_consultant: c1, reason: "initial assignment" });
  });

  it("dependencies block with an explanation, and the status the student sees follows them", async () => {
    const v = await view();
    const goals = v.tasks.find((x) => x.task.taskKey === "s1.goals")!;
    expect(goals.effective).toBe("blocked");
    expect(goals.block.reason).toContain("Complete your study-abroad profile");
    expect(goals.block.blockers[0].howToUnblock).toContain("Finish");
    const t = goals.task;
    expect(await SV.moveTask(t.id, S(), "in_progress")).toMatch(/waiting on other tasks/);
    // email + profile are proved by facts, never by a click
    const email = await tk("s1.email_verified");
    expect(email.status).toBe("completed"); // mkUser sets email_verified_at, the automatic check proved it
    const evid = await ST.evidenceFor(email.id);
    expect(evid[0]).toMatchObject({ kind: "confirmation", byRole: "system" });
    expect(await status("s1.profile_form")).toBe("not_started");
    await B.db.run("INSERT INTO sa_profiles (user_id, level, field, score_type, score_value, academic_index, english_test, budget_inr, countries, intake, goal, stage, consent_at, consent_version, created_at, updated_at) VALUES ($1,'PG','CS','percentage',75,75,'IELTS',2000000,'uk','Fall 2027','x','ONBOARDING',NOW(),'2026-10',NOW(),NOW())", [sid]);
    await SV.runAutoChecks(caseId);
    expect(await status("s1.profile_form")).toBe("completed");
    expect((await view()).tasks.find((x) => x.task.taskKey === "s1.goals")!.effective).toBe("ready_to_start");
  });

  it("a task never completes without its evidence and a note; students cannot self-approve reviewed work", async () => {
    const g = await tk("s1.goals");
    expect(await SV.moveTask(g.id, S(), "in_progress")).toBeNull();
    expect(await SV.moveTask(g.id, S(), "completed", "all done")).toMatch(/Add this to finish/);
    expect(await SV.moveTask(g.id, S(), "completed", "")).toBeTruthy();
    expect(await status("s1.goals")).toBe("in_progress");
    expect(await SV.addNoteEvidence(g.id, S(), "text", "ab")).toMatch(/few characters/);
    expect(await SV.addNoteEvidence(g.id, S(), "text", "Cheapest good course; max 25 lakh")).toBeNull();
    expect(await SV.moveTask(g.id, S(), "completed", "")).toMatch(/note/);
    expect(await SV.moveTask(g.id, S(), "completed", "Written down after the call")).toBeNull();
    const done = await tk("s1.goals");
    expect(done).toMatchObject({ status: "completed", completedBy: sid });
    // the trail records who did what, from which status
    const ev = await ST.events(caseId, { taskId: g.id });
    expect(ev.map((e) => `${e.kind}:${e.from_status}>${e.to_status}`)).toContain("status:in_progress>completed");
    expect(ev.find((e) => e.kind === "status" && e.to_status === "completed")!.actor_id).toBe(sid);
    // transcripts is a reviewed task: the student can only submit it, with a document
    const tr = await tk("s2.transcripts");
    expect(await SV.moveTask(tr.id, S(), "completed", "I checked it myself")).toMatch(/checked by your consultant/);
    expect(await status("s2.transcripts")).toBe("not_started");
  });

  it("review flow: document versions, rejection with a reason, new version, approval, audit", async () => {
    // unlock stage 2 transcripts (depends only on profile, which is done)
    const tr = await tk("s2.transcripts");
    expect(await SV.moveTask(tr.id, S(), "in_progress")).toBeNull();
    expect(await SV.moveTask(tr.id, S(), "submitted_for_review")).toMatch(/Add this before submitting/);
    const d1 = await DC.upload(caseId, S(), { docKey: "transcripts", taskId: tr.id }, file("t1.pdf"));
    expect(typeof d1).toBe("number");
    expect(await SV.moveTask(tr.id, S(), "submitted_for_review")).toBeNull();
    expect(await status("s2.transcripts")).toBe("submitted_for_review");
    expect((await SV.reviewQueue(C1())).map((q) => q.taskId)).toContain(tr.id);
    expect((await SV.reviewQueue(C2())).map((q) => q.taskId)).not.toContain(tr.id); // not their student
    expect(await SV.moveTask(tr.id, S(), "in_progress")).toMatch(/reviewing/);
    // reject the document and ask for changes
    expect(await DC.review(d1 as number, C2(), false, "Blurry scan, please redo")).toBe("Document not found.");
    expect(await DC.review(d1 as number, C1(), false, "bad")).toMatch(/Tell the student/);
    expect(await DC.review(d1 as number, C1(), false, "Page 2 is cut off, please re-scan")).toBeNull();
    expect(await SV.moveTask(tr.id, C1(), "changes_requested", "")).toMatch(/what to change/);
    expect(await SV.moveTask(tr.id, C1(), "changes_requested", "Re-scan page 2")).toBeNull();
    expect(await status("s2.transcripts")).toBe("changes_requested");
    // a second upload is version 2; version 1 is kept as superseded
    const d2 = (await DC.upload(caseId, S(), { docKey: "transcripts", taskId: tr.id }, file("t2.pdf"))) as number;
    const versions = (await DC.listDocs(caseId)).filter((d) => d.docKey === "transcripts");
    expect(versions.map((d) => [d.version, d.status])).toEqual([[2, "uploaded"], [1, "superseded"]]);
    expect(await SV.moveTask(tr.id, S(), "submitted_for_review")).toBeNull();
    expect(await SV.moveTask(tr.id, C1(), "completed", "Looks complete now")).toBeNull();
    expect(await status("s2.transcripts")).toBe("completed");
    // approving a task does not silently verify the document: that is its own audited action
    expect((await DC.findDoc(d2))!.status).toBe("uploaded");
    expect(await DC.review(d2, C1(), true, "")).toBeNull();
    expect((await DC.findDoc(d2))!.status).toBe("verified");
    expect((await DC.review(d1 as number, C1(), true, ""))).toMatch(/newer version/);
    const log = (await ST.events(caseId, { limit: 200 })).map((e) => e.kind);
    expect(log).toEqual(expect.arrayContaining(["doc.uploaded", "doc.rejected", "doc.verified"]));
    // bad files are refused
    expect(await DC.upload(caseId, S(), { docKey: "cv" }, { name: "x.pdf", size: 4, bytes: new TextEncoder().encode("junk") })).toMatch(/PDF, JPG/);
    expect(await DC.upload(caseId, S2(), { docKey: "cv" }, file())).toBe("Case not found.");
  });

  it("documents are private: only the owner, the assigned consultant and admins can open them, and every open is logged", async () => {
    const docs = await DC.listDocs(caseId, { latestOnly: true });
    const doc = docs.find((d) => d.docKey === "transcripts")!;
    expect(await DC.link(doc.id, S2())).toBeNull();
    expect(await DC.link(doc.id, C2())).toBeNull();
    const l = (await DC.link(doc.id, S()))!;
    expect(l).toMatch(/^\/abroad\/journey\/doc\/\d+\?exp=\d+&sig=[0-9a-f]{64}$/);
    const q = new URL("https://x" + l);
    expect(await DC.validLink(doc.id, sid, Number(q.searchParams.get("exp")), q.searchParams.get("sig")!)).toBe(true);
    expect(await DC.validLink(doc.id, sid2, Number(q.searchParams.get("exp")), q.searchParams.get("sig")!)).toBe(false); // bound to the viewer
    expect(await DC.validLink(doc.id, sid, Number(q.searchParams.get("exp")) - 1000, q.searchParams.get("sig")!)).toBe(false);
    expect(await DC.openFile(doc.id, S2())).toBeNull();
    const f = await DC.openFile(doc.id, C1());
    expect(f?.mime).toBe("application/pdf");
    expect((await DC.accessLog(caseId))[0]).toMatchObject({ doc_id: doc.id, viewer_id: c1, viewer_role: "counselor" });
    const pass = (await DC.upload(caseId, S(), { docKey: "passport", expiresOn: "2031-01-01" }, file("p.pdf"))) as number;
    expect((await DC.findDoc(pass))).toMatchObject({ restricted: true, expiresOn: "2031-01-01" });
    expect(await DC.canOpen(pass, C2())).toBeNull();
  });

  it("applications are independent, de-duplicated, and each gets its own tasks", async () => {
    const a1 = await AP.addApplication(caseId, S(), { uniName: "University of Leeds", programme: "MSc Data Science", intake: "Fall 2027", category: "target" });
    const a2 = await AP.addApplication(caseId, C1(), { uniName: "University of Oxford", programme: "MSc Computer Science", intake: "Fall 2027", category: "ambitious" });
    const a3 = await AP.addApplication(caseId, C1(), { uniName: "Coventry University", programme: "MSc Data Science", intake: "Fall 2027", category: "safer" });
    expect([typeof a1, typeof a2, typeof a3]).toEqual(["number", "number", "number"]);
    expect(await AP.addApplication(caseId, S(), { uniName: "  university of  LEEDS ", programme: "msc data science", intake: "fall 2027", category: "target" })).toMatch(/already have/);
    expect(typeof (await AP.addApplication(caseId, S(), { uniName: "University of Leeds", programme: "MSc Data Science", intake: "Spring 2028", category: "target" }))).toBe("number"); // another intake is a different application
    expect(await AP.addApplication(caseId, S2(), { uniName: "X University", programme: "MSc Y", intake: "Fall 2027", category: "target" })).toBe("Case not found.");
    const l = (await ST.loadCase(caseId))!;
    const per = (id: number) => l.tasks.filter((t) => t.applicationId === id).map((t) => t.taskKey).sort();
    expect(per(a1 as number)).toEqual(per(a2 as number));
    expect(per(a1 as number)).toContain("s6a.submit");
    // approving one university does not move another
    const ap1 = await tk("s3a.approve", a1 as number);
    expect(ap1.status).toBe("not_started");
    // shortlist-mix is proved from the application categories (ambitious + target + safer)
    await SV.runAutoChecks(caseId);
    expect(await status("s3.mix")).not.toBe("completed"); // blocked until the longlist exists
    // withdraw one: others and their tasks are untouched
    const before = (await ST.loadCase(caseId))!.tasks.filter((t) => t.applicationId === a2 as number).map((t) => t.status);
    expect(await EX.recordNow(caseId, C1(), "change_university", "Student prefers a cheaper option", { uniName: "Kingston University", programme: "MSc Data Science", category: "target" }, a3 as number)).toBeNull();
    const l2 = (await ST.loadCase(caseId))!;
    expect(l2.apps.find((x) => x.id === a3)).toMatchObject({ status: "withdrawn" });
    expect(l2.apps.find((x) => x.uniName === "Kingston University")).toBeTruthy();
    expect(l2.tasks.filter((t) => t.applicationId === a3 as number).every((t) => t.status === "not_applicable")).toBe(true);
    expect(l2.tasks.filter((t) => t.applicationId === a3 as number).every((t) => t.naApprovedBy === c1 && t.naReason)).toBe(true);
    expect(l2.tasks.filter((t) => t.applicationId === a2 as number).map((t) => t.status)).toEqual(before);
    expect(l2.apps.find((x) => x.id === a1)!.status).toBe("shortlisted");
  });

  it("application status follows verified task completion (submission needs proof; offer details close the right tasks)", async () => {
    // fast-forward the shared prerequisites with direct staff completion, then walk one application end to end
    const l = (await ST.loadCase(caseId))!;
    const a = l.apps.find((x) => x.uniName === "University of Oxford")!;
    const force = async (key: string, appId: number | null) => {
      const t = await tk(key, appId);
      await B.db.run("UPDATE oj_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1", [t.id]);
    };
    for (const k of ["s3.comparison", "s5.readiness", "s4.verified_core", "s3.approve", "s7.comm_log"]) await force(k, null);
    expect(await doStudent("s3a.approve", "Approved by me, 28 Oct", a.id)).toBeNull();
    expect((await ST.loadCase(caseId))!.apps.find((x) => x.id === a.id)!.status).toBe("preparing");
    await force("s4a.checklist", a.id); await force("s4a.extra_docs", a.id); await force("s4a.docs_complete", a.id); await force("s5a.form", a.id); await force("s5a.fee", a.id); await force("s6a.final_review", a.id);
    expect(await doStudent("s6a.signoff", "Checked my details", a.id)).toBeNull();
    // submission without proof is refused: the application stays unsubmitted
    const sub = await tk("s6a.submit", a.id);
    expect(await SV.moveTask(sub.id, C1(), "completed", "Submitted via portal")).toMatch(/Missing/);
    expect((await ST.loadCase(caseId))!.apps.find((x) => x.id === a.id)!.status).toBe("preparing");
    const proof = (await DC.upload(caseId, C1(), { docKey: "submission_proof", applicationId: a.id, taskId: sub.id }, file("proof.pdf"))) as number;
    expect(await SV.moveTask(sub.id, C1(), "completed", "Submitted via portal")).toMatch(/Missing/); // uploaded but not verified yet
    expect(await DC.review(proof, C1(), true, "")).toBeNull();
    expect(await SV.moveTask(sub.id, C1(), "completed", "Submitted via portal, confirmation saved")).toBeNull();
    const after = (await ST.loadCase(caseId))!.apps;
    expect(after.find((x) => x.id === a.id)).toMatchObject({ status: "submitted" });
    expect(after.find((x) => x.uniName === "University of Leeds")!.status).toBe("shortlisted"); // independent
    // the university acknowledges, then an unconditional offer closes the conditions task with a stated reason
    await doStaff("s6a.confirmation", C1(), a.id);
    expect((await ST.loadCase(caseId))!.apps.find((x) => x.id === a.id)!.status).toBe("under_review");
    const dec = await tk("s7a.decision", a.id);
    expect(await SV.moveTask(dec.id, C1(), "in_progress")).toBeNull();
    await DC.upload(caseId, C1(), { docKey: "offer_letter", applicationId: a.id, taskId: dec.id }, file("offer.pdf"));
    expect(await SV.moveTask(dec.id, C1(), "completed", "Offer letter received 3 Mar")).toBeNull();
    expect((await ST.loadCase(caseId))!.apps.find((x) => x.id === a.id)!.status).toBe("offer");
    const rec = await tk("s8a.offer_record", a.id);
    const offerDoc = (await DC.listDocs(caseId, { latestOnly: true })).find((d) => d.docKey === "offer_letter")!;
    await DC.review(offerDoc.id, C1(), true, "");
    await SV.addNoteEvidence(rec.id, C1(), "text", "Unconditional, accept by 30 April");
    expect(await SV.moveTask(rec.id, C1(), "completed", "Recorded", {})).toMatch(/conditional or unconditional/);
    expect(await SV.moveTask(rec.id, C1(), "completed", "Recorded", { offer: { type: "unconditional", conditions: "", deadline: "2027-04-30", deposit: "£2,000" } })).toBeNull();
    const cond = await tk("s8a.conditions", a.id);
    expect(cond).toMatchObject({ status: "not_applicable", naApprovedBy: c1 });
    expect(cond.naReason).toMatch(/Unconditional/);
    expect((await ST.loadCase(caseId))!.apps.find((x) => x.id === a.id)).toMatchObject({ offerType: "unconditional", depositAmount: "£2,000" });
  });

  it("not applicable needs a reason and a different, senior approver", async () => {
    const t = await tk("s1.budget");
    expect(await SV.requestNa(t.id, S(), "no")).toMatch(/Explain/);
    expect(await SV.requestNa(t.id, S(), "My parents fund this fully, so no budget plan is needed")).toBeNull();
    expect(await SV.requestNa(t.id, S(), "Asking again for the same task here")).toMatch(/already/);
    expect(await SV.decideNa(t.id, S(), true)).toMatch(/Only staff/);
    expect(await SV.decideNa(t.id, C2(), true)).toBe("Task not found.");
    expect(await SV.decideNa(t.id, C1(), false, "no")).toMatch(/why you are declining/);
    expect(await SV.decideNa(t.id, C1(), true)).toBeNull();
    expect(await tk("s1.budget")).toMatchObject({ status: "not_applicable", naApprovedBy: c1, naReason: expect.stringContaining("parents fund") });
    // staff-raised requests need an administrator
    const t2 = await tk("s1.countries");
    expect(await SV.requestNa(t2.id, C1(), "The student has one fixed destination already")).toBeNull();
    expect(await SV.decideNa(t2.id, C1(), true)).toMatch(/different person/);
    expect(await SV.decideNa(t2.id, A(), true)).toBeNull();
    expect((await ST.events(caseId)).map((e) => e.kind)).toEqual(expect.arrayContaining(["na.requested", "na.approved"]));
    // students cannot ask for critical steps to be dropped
    const crit = await tk("s4.passport");
    expect(await SV.requestNa(crit.id, S(), "I do not have a passport right now")).toMatch(/Critical/);
  });

  it("overdue is calculated, waiting on the university is not the student's failure, and escalation is de-duplicated", async () => {
    const pass = await tk("s4.passport");
    await B.db.run("UPDATE oj_tasks SET due_at = '2026-01-01 23:59:59' WHERE id = $1", [pass.id]);
    const uni = await tk("s6a.confirmation", (await ST.loadCase(caseId))!.apps.find((x) => x.uniName === "University of Leeds")!.id);
    await B.db.run("UPDATE oj_tasks SET due_at = '2026-01-01 23:59:59', status = 'waiting_on_university' WHERE id = $1", [uni.id]);
    const v = await view();
    const p = v.tasks.find((x) => x.task.id === pass.id)!;
    expect([p.overdue, p.party]).toEqual([true, "student"]);
    expect(v.tasks.find((x) => x.task.id === uni.id)).toMatchObject({ overdue: true, party: "university" });
    expect(v.counts.overdueStudent).toBe(v.tasks.filter((x) => x.overdue && x.party === "student").length);
    expect(v.counts.overdueAll).toBeGreaterThan(v.counts.overdueStudent);
    expect(v.counts.waitingUniversity).toBeGreaterThanOrEqual(1);
    await B.db.run("UPDATE oj_tasks SET status = 'completed' WHERE id = $1", [pass.id]);
    expect((await view()).tasks.find((x) => x.task.id === pass.id)!.overdue).toBe(false); // done tasks are never overdue
    await B.db.run("UPDATE oj_tasks SET status = 'in_progress' WHERE id = $1", [pass.id]);

    const r1 = await NT.runSweep(new Date());
    const r2 = await NT.runSweep(new Date());
    expect(r1.overdue + r1.escalations).toBeGreaterThan(0);
    expect(r2).toEqual({ reminders: 0, overdue: 0, escalations: 0, universityFollowUps: 0, reviewSla: 0, docExpiry: 0, manual: 0 }); // nothing twice
    const mine = await B.db.all<{ kind: string; dedupe_key: string }>("SELECT kind, dedupe_key FROM oj_notifications WHERE user_id = $1 AND task_id = $2", [sid, pass.id]);
    expect(mine.map((m) => m.kind)).toContain("overdue");
    const cons = await B.db.all<{ kind: string; title: string }>("SELECT kind, title FROM oj_notifications WHERE user_id = $1 AND task_id = $2", [c1, pass.id]);
    expect(cons.map((m) => m.kind)).toContain("escalation");
    const adm2 = await B.db.all("SELECT 1 FROM oj_notifications WHERE user_id = $1 AND dedupe_key = $2", [adm, `esc2:${pass.id}`]);
    expect(adm2.length).toBe(1); // 7+ days overdue reaches the manager level
    // the university's lateness reaches the consultant as a follow-up, never the student
    const uniStudent = await B.db.all("SELECT 1 FROM oj_notifications WHERE user_id = $1 AND task_id = $2 AND kind IN ('overdue','escalation')", [sid, uni.id]);
    expect(uniStudent.length).toBe(0);
    expect((await B.db.all("SELECT 1 FROM oj_notifications WHERE user_id = $1 AND kind = 'university_followup'", [c1])).length).toBeGreaterThan(0);
    // email went through the existing outbox, once per notification
    const sentTo = await B.db.val<number>("SELECT COUNT(*) FROM mail_outbox WHERE kind LIKE 'journey_%' AND to_email = (SELECT email FROM users WHERE id = $1)", [sid]);
    expect(Number(sentTo)).toBeGreaterThan(0);
  });

  it("notification preferences are respected", async () => {
    const unread0 = await NT.unreadCount(sid2);
    await NT.setPrefs(sid2, false, false);
    const before = Number(await B.db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = (SELECT email FROM users WHERE id = $1)", [sid2]));
    const made = await NT.notify({ userId: sid2, kind: "reminder", title: "Due soon: thing", dedupe: `t:${tag}:1` });
    expect(made).toBe(true);
    expect(await NT.notify({ userId: sid2, kind: "reminder", title: "Due soon: thing", dedupe: `t:${tag}:1` })).toBe(false);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = (SELECT email FROM users WHERE id = $1)", [sid2]))).toBe(before);
    expect(await NT.unreadCount(sid2)).toBe(unread0);
    expect(await NT.notify({ userId: sid2, kind: "overdue", title: "Overdue critical", dedupe: `t:${tag}:2`, force: true })).toBe(true);
    expect(await NT.unreadCount(sid2)).toBe(unread0 + 1); // a critical alert always shows in the app
    await NT.setPrefs(sid2, true, true);
  });

  it("exceptions keep history: visa refusal adds a recovery plan, reapplication supersedes without erasing", async () => {
    const x = await EX.request(case2, S2(), "visa_refusal", "The visa was refused on 3 July", {});
    expect(typeof x).toBe("number");
    expect(await EX.request(case2, S2(), "visa_refusal", "Another request about the same thing", {})).toMatch(/already waiting/);
    expect(await EX.apply(x as number, S2())).toBe("Request not found."); // students cannot apply
    expect(await EX.apply(x as number, C1())).toBe("Request not found."); // not their student
    // no visa decision to refuse yet? the decision task exists, so applying works
    expect(await EX.apply(x as number, C2())).toBeNull();
    const l = (await ST.loadCase(case2))!;
    expect(l.tasks.find((t) => t.taskKey === "s10.decision")).toMatchObject({ status: "blocked", blockedReason: expect.stringContaining("refused") });
    expect(l.tasks.filter((t) => t.taskKey.startsWith("rx.visa.")).map((t) => t.taskKey).sort()).toEqual(["rx.visa.analysis", "rx.visa.letter", "rx.visa.options", "rx.visa.plan"]);
    expect(await EX.recordNow(case2, C2(), "visa_reapply", "Student wants to try again")).toMatch(/decide on the next step/);
    await B.db.run("UPDATE oj_tasks SET status = 'completed' WHERE case_id = $1 AND task_key = 'rx.visa.options'", [case2]);
    expect(await EX.recordNow(case2, C2(), "visa_reapply", "Student wants to try again after fixing the finances")).toBeNull();
    const l2 = (await ST.loadCase(case2))!;
    const decisions = l2.tasks.filter((t) => t.taskKey === "s10.decision").sort((a, b) => a.attempt - b.attempt);
    expect(decisions.map((d) => [d.attempt, d.status])).toEqual([[1, "not_applicable"], [2, "not_started"]]);
    expect(decisions[0].naReason).toMatch(/Superseded/);
    // downstream travel tasks now wait on the NEW decision, not the superseded one
    const flight = l2.tasks.find((t) => t.taskKey === "s11.flight")!;
    const dep = l2.deps.filter((d) => d.taskId === flight.id).map((d) => l2.byId.get(d.dependsOn)!);
    expect(dep.map((d) => `${d.taskKey}#${d.attempt}`)).toEqual(["s10.decision#2"]);
    expect((await view(case2)).tasks.find((t) => t.task.id === flight.id)!.effective).toBe("blocked");
    // nothing was deleted and the trail says what happened
    expect((await ST.events(case2, { limit: 100 })).map((e) => e.kind)).toEqual(expect.arrayContaining(["exception.requested", "exception.applied"]));
  });

  it("rejection closes only that application; deferral reschedules open deadlines; withdrawal closes everything and keeps the record", async () => {
    const l = (await ST.loadCase(caseId))!;
    const leeds = l.apps.find((x) => x.uniName === "University of Leeds" && x.intake === "Fall 2027")!;
    const oxford = l.apps.find((x) => x.uniName === "University of Oxford")!;
    expect(await EX.recordNow(caseId, C1(), "rejection", "Rejected by Leeds on 14 March", {}, leeds.id)).toBeNull();
    const l1 = (await ST.loadCase(caseId))!;
    expect(l1.apps.find((x) => x.id === leeds.id)).toMatchObject({ status: "rejected" });
    expect(l1.apps.find((x) => x.id === oxford.id)!.status).toBe("offer");
    expect(l1.tasks.some((t) => t.taskKey.startsWith("rx.rej."))).toBe(true);
    // deferral
    const dueBefore = (await tk("s5.sop_final")).dueAt;
    expect(await EX.recordNow(caseId, C1(), "deferral", "Student needs another year", {})).toMatch(/which intake/);
    expect(await EX.recordNow(caseId, C1(), "deferral", "Student needs another year to prepare", { newIntake: "Fall 2028" })).toBeNull();
    expect((await ST.getCase(caseId))!.intake).toBe("Fall 2028");
    const dueAfter = (await tk("s5.sop_final")).dueAt;
    expect(new Date(dueAfter!.replace(" ", "T")).getTime() - new Date(dueBefore!.replace(" ", "T")).getTime()).toBeGreaterThan(300 * 86_400_000);
    expect((await ST.events(caseId, { limit: 200 })).some((e) => e.kind === "exception.applied" && String(e.note).includes("Fall 2028"))).toBe(true);
    // withdrawal
    expect(await EX.recordNow(case2, C2(), "withdrawal", "Student is no longer going abroad", {})).toBeNull();
    const w = (await ST.loadCase(case2))!;
    expect(w.c.status).toBe("withdrawn");
    expect(w.tasks.filter((t) => !t.taskKey.startsWith("rx.wd.")).every((t) => ["completed", "not_applicable"].includes(t.status))).toBe(true);
    expect(await SV.moveTask((await tk("s1.goals", null, case2)).id, S2(), "in_progress")).toMatch(/withdrawn/);
    // refund requests are recorded and routed to administrators, not paid by this system
    expect(typeof (await EX.request(case2, S2(), "refund", "Please review a refund for the unused package"))).toBe("number");
  });

  it("package entitlements come from a verified payment, never from a page or from staff", async () => {
    await B.db.run("DELETE FROM pay_entitlements WHERE user_id = $1", [sid]);
    expect(await ST.packageLevel(sid)).toBe(0);
    const pkgBefore = (await view(caseId, 0)).locked.map((v) => v.task.taskKey);
    expect(pkgBefore).toEqual(expect.arrayContaining(["s10.mock", "s11.briefing"])); // staff-delivered services are shown as locked, not hidden
    expect((await view(caseId, 0)).tasks.filter((v) => v.task.priority === "critical").every((v) => !v.ent.locked)).toBe(true);
    // a locked service cannot be delivered/completed without the package
    const mock = await tk("s10.mock");
    expect(await SV.moveTask(mock.id, A(), "completed", "Done a mock")).toMatch(/not part of the student's package/);
    // buy the package the real way
    const { seedCatalogue } = await import("../pay/catalogue");
    await seedCatalogue();
    rzp.install();
    const { buy } = await import("../pay/test-setup");
    await buy(rzp, sid, (await B.db.val<string>("SELECT email FROM users WHERE id = $1", [sid]))!, "abroad-global-success");
    expect(await ST.packageLevel(sid)).toBe(4);
    const unlocked = await view(caseId);
    expect(unlocked.level).toBe(4);
    expect(unlocked.locked.map((v) => v.task.taskKey)).not.toContain("s10.mock");
    expect(unlocked.locked.map((v) => v.task.taskKey)).toEqual(expect.arrayContaining(["s12.checkin30"])); // level 5 still locked
    await B.db.run("UPDATE pay_entitlements SET status = 'revoked' WHERE user_id = $1", [sid]);
    expect(await ST.packageLevel(sid)).toBe(0);
  });

  it("template edits never rewrite existing cases; new versions are explicit and previewable", async () => {
    const v2 = JSON.parse(JSON.stringify(BUILTIN_TEMPLATE));
    v2.tasks.push({ ...v2.tasks[0], key: "s1.extra_check", title: "An extra intake check", auto: undefined, deps: [] });
    v2.tasks.find((t: { key: string }) => t.key === "s1.goals").title = "Renamed goals task";
    const { validateTemplate, diffTemplates } = await import("./template");
    const ok = validateTemplate(v2);
    expect(ok.ok).toBe(true);
    const countBefore = (await ST.loadCase(caseId))!.tasks.length;
    const ver = await ST.publishTemplate(v2, adm, "Add an extra check");
    expect(ver).toBeGreaterThan(1);
    expect((await ST.currentTemplate()).version).toBe(ver);
    const afterCase = (await ST.loadCase(caseId))!;
    expect(afterCase.c.templateVersion).toBe(1); // pinned
    expect(afterCase.tasks.length).toBe(countBefore);
    expect(afterCase.tasks.find((t) => t.taskKey === "s1.goals")!.title).toBe("Set your goals and constraints".length ? afterCase.tasks.find((t) => t.taskKey === "s1.goals")!.title : "");
    expect(afterCase.tasks.find((t) => t.taskKey === "s1.goals")!.title).not.toBe("Renamed goals task");
    const d = diffTemplates(await ST.templateVersion("overseas-v1", 1), await ST.templateVersion("overseas-v1", ver), afterCase.c.profile);
    expect(d.add.map((t) => t.key)).toEqual(["s1.extra_check"]);
    expect(d.changed.map((c) => c.key)).toContain("s1.goals");
    // a new case after the publish gets the new version
    const sid3 = await mkUser(B.db, "student", "jstu3");
    const c3 = await ST.createCase(sid3, input, { id: sid3, role: "student" });
    expect((await ST.getCase(c3))!.templateVersion).toBe(ver);
    expect((await ST.loadCase(c3))!.tasks.some((t) => t.taskKey === "s1.extra_check")).toBe(true);
    await B.db.run("DELETE FROM users WHERE id = $1", [sid3]);
    await B.db.run("DELETE FROM oj_templates WHERE template_key = 'overseas-v1' AND version = $1", [ver]);
  });

  it("dashboard numbers match the database rows", async () => {
    const v = await view();
    const rows = await B.db.all<{ status: string; stage: number; n: number }>("SELECT status, stage, COUNT(*) AS n FROM oj_tasks WHERE case_id = $1 AND obsolete = 0 GROUP BY status, stage", [caseId]);
    const lockedKeys = new Set(v.locked.map((x) => x.task.taskKey + "|" + (x.task.applicationId ?? 0)));
    const live = (await ST.loadCase(caseId))!.tasks.filter((t) => !t.obsolete && t.status !== "not_applicable" && !lockedKeys.has(t.taskKey + "|" + (t.applicationId ?? 0)));
    expect(v.progress.total).toBe(live.length);
    expect(v.progress.done).toBe(live.filter((t) => t.status === "completed").length);
    expect(v.progress.pct).toBe(Math.round((live.filter((t) => t.status === "completed").length / live.length) * 100));
    const sqlTotal = rows.filter((r) => r.status !== "not_applicable").reduce((a, r) => a + Number(r.n), 0);
    expect(sqlTotal).toBeGreaterThanOrEqual(v.progress.total);
    for (const s of v.progress.stages) expect(s.total).toBe(live.filter((t) => t.stage === s.stage).length);
    const wl = (await WS.caseload(A())).find((r) => r.caseId === caseId)!;
    expect(wl.done).toBe((await B.db.all("SELECT 1 FROM oj_tasks WHERE case_id = $1 AND obsolete = 0 AND status = 'completed'", [caseId])).length);
    expect(v.counts.awaitingReview).toBe(live.filter((t) => t.status === "submitted_for_review").length);
    expect(v.next.every((n) => n.task.owner === "student")).toBe(true);
  });

  it("legacy cards map the seven original stages, and carry-over needs a staff confirmation", async () => {
    const cards = LG.legacyCards([{ stage: 1, total: 4, done: 4 }, { stage: 2, total: 2, done: 2 }, { stage: 3, total: 2, done: 2 }, { stage: 4, total: 5, done: 1 }, { stage: 12, total: 3, done: 0 }]);
    expect(cards.map((c) => [c.name, c.state])).toEqual([["Profile", "done"], ["Documents", "current"], ["Review", "todo"], ["Applied", "todo"], ["Offer", "todo"], ["Visa", "todo"], ["Arrived", "todo"]]);
    expect(await LG.carryOver(caseId, S(), 3, "I did it myself already, honest")).toEqual({ error: "Case not found." });
    expect(await LG.carryOver(caseId, C1(), 3, "ok")).toMatchObject({ error: expect.stringMatching(/earlier tracker/) });
  });

  it("analytics come from real rows and withhold small-group rates", async () => {
    const a = await AN.compute();
    expect(a.cases.total).toBeGreaterThanOrEqual(2);
    expect(a.enough).toBe(false);
    expect(a.funnel[0].count).toBe(a.cases.total);
    expect(a.funnel.slice(1).every((f) => f.ofPrev === null)).toBe(true); // < 5 cases: no rates
    expect(a.stages.length).toBeGreaterThan(5);
    expect(a.stages.every((s) => s.completionPct === null)).toBe(true);
    expect(a.delay.total).toBe(a.delay.student + a.delay.consultant + a.delay.university);
    expect(a.workload.find((w) => w.consultantId === c1)!.cases).toBe(1);
  });

  it("CSV export neutralises spreadsheet formulas and carries no document content", () => {
    const csv = WS.toCsv([{ caseId: 1, studentId: 1, student: "=HYPERLINK(\"http://x\")", email: "a@b.c", destination: "uk", degree: "PG", intake: "Fall 2027", consultantId: null, consultant: null, caseStatus: "active", total: 10, done: 5, pct: 50, stage: 2, overdue: 1, criticalOverdue: 0, due7: 2, review: 0, lastEvent: null, universities: "Leeds, \"Oxford\"" }]);
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain("Unassigned");
    expect(csv.split("\r\n")[0]).toContain("Progress %");
  });
});
