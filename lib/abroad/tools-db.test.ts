import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Visa tracker, proof of funds, loans, interview practice and the privacy tools on a real database.
 *
 *   PORTAL_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/growqr_test npx vitest run lib/abroad/tools-db.test.ts
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-host": "growqr.test", "x-forwarded-proto": "https" }),
}));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const DB = process.env.PORTAL_TEST_DATABASE_URL;
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");

describe.skipIf(!DB)("study-abroad tools on a real database", () => {
  const tag = Math.random().toString(16).slice(2, 8);
  const email = `tl-${tag}@portal-test.invalid`;
  let uid = 0;
  let other = 0;
  let db: typeof import("../portal/db");
  let A: typeof import("./catalogue");
  let S: typeof import("./store");
  let V: typeof import("./vault");
  let VI: typeof import("./visa");
  let F: typeof import("./funds");
  let L: typeof import("./loans");
  let M: typeof import("./mock-interview");
  let P: typeof import("./privacy");
  let appId = 0;
  let finDoc = 0;
  let caseId = 0;
  const audit = async () => undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.PORTAL_APP_URL = "https://growqr.test";
    process.env.STORAGE_DIR = path.join(process.env.TEMP ?? "/tmp", `abroad-tools-${tag}`);
    delete process.env.RESEND_API_KEY;
    db = await import("../portal/db");
    A = await import("./catalogue");
    S = await import("./store");
    V = await import("./vault");
    VI = await import("./visa");
    F = await import("./funds");
    L = await import("./loans");
    M = await import("./mock-interview");
    P = await import("./privacy");
    await A.sync(JSON.parse(readFileSync(path.resolve(__dirname, "data/study-abroad.json"), "utf8")));
    const auth = await import("../portal/auth");
    const mk = async (e: string) => {
      const r = await auth.register({ role: "student", name: "Tools " + tag, email: e, password: "blue-kettle-orbit-nine", college: "Test College" }, "198.51.100.95");
      if (!r.ok) throw new Error(r.error);
      return r.userId;
    };
    uid = await mk(email);
    other = await mk(`tl-o-${tag}@portal-test.invalid`);
    await S.saveProfile(uid, { level: "PG", field: "Data Science & AI", score_type: "percentage", score_value: 80, english_test: "IELTS", english_score: 7, gre: null, budget_inr: 5000000, countries: ["usa"], intake: "Fall 2027", goal: "" }, true);
    const uni = (await A.university("mit"))!;
    appId = (await S.createApplication(uid, uni.id, "MS Data Science", "Fall 2027")) as number;
  });

  afterAll(async () => {
    if (!db) return;
    await db.run("DELETE FROM users WHERE email LIKE $1", [`%${tag}@portal-test.invalid`]);
    await db.run("DELETE FROM mail_outbox WHERE to_email LIKE $1", [`%${tag}@portal-test.invalid`]);
    await db.run("DELETE FROM auth_throttle WHERE bucket = 'reg:198.51.100.95'");
    await db.run("DELETE FROM sa_audit WHERE actor_user_id IN ($1,$2) OR subject_user_id IN ($1,$2)", [uid, other]);
    await db.closePool();
  });

  it("opens a visa case only once an offer exists, and checks the appointment rules", async () => {
    expect(await VI.forUser(uid)).toEqual([]);
    await db.run("UPDATE sa_applications SET status = 'accepted' WHERE id = $1", [appId]);
    const cases = await VI.forUser(uid);
    expect(cases).toHaveLength(1);
    await VI.forUser(uid); // idempotent
    expect(await db.val("SELECT COUNT(*) FROM sa_visa WHERE user_id = $1", [uid])).toBe(1);
    caseId = cases[0].id;
    expect(cases[0]).toMatchObject({ stage: "preparing", uni_name: "Massachusetts Institute of Technology", country_key: "usa" });
    expect(await VI.save(other, caseId, { stage: "preparing" })).toBe("Visa case not found.");
    expect(await VI.save(uid, caseId, { stage: "nope" })).toMatch(/Choose where/);
    expect(await VI.save(uid, caseId, { stage: "preparing", appointment_at: "not a date" })).toMatch(/format shown/);
    expect(await VI.save(uid, caseId, { stage: "booked" })).toMatch(/Add your appointment date/);
    expect(await VI.save(uid, caseId, { stage: "preparing", appointment_at: "2019-01-01T10:00" })).toMatch(/date looks wrong/);
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 16);
    expect(await VI.save(uid, caseId, { stage: "attended", appointment_at: soon })).toMatch(/still in the future/);
    expect(await VI.save(uid, caseId, { stage: "booked", appointment_at: soon, centre: "  VFS Chennai  ", notes: "Bring originals" })).toBeNull();
    const c = await VI.find(caseId);
    expect(c).toMatchObject({ stage: "booked", centre: "VFS Chennai", notes: "Bring originals" });
    expect(String(c?.appointment_at).slice(0, 16).replace(" ", "T")).toBe(soon);
  });

  it("builds a readiness list and sends each reminder once, again if the appointment moves", async () => {
    const c = (await VI.find(caseId))!;
    const r = await VI.readiness(uid, c);
    expect(r.total).toBe(6);
    expect(r.items.find((i) => i[0] === "Offer accepted")?.[1]).toBe(true);
    expect(r.items.find((i) => i[0] === "Appointment booked")?.[1]).toBe(true);
    expect(r.items.find((i) => i[0].startsWith("Visa checklist complete"))?.[0]).toMatch(/\(0\/\d+\)/);
    expect(r.items.find((i) => i[0] === "Mock interview practised")?.[1]).toBe(false);
    expect(await VI.sendDueReminders()).toBeGreaterThanOrEqual(1); // 5 days away: the 7-day reminder
    const first = await db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = $1 AND kind = 'visa_reminder_7'", [email]);
    expect(first).toBe(1);
    await VI.sendDueReminders();
    expect(await db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = $1 AND kind = 'visa_reminder_7'", [email])).toBe(1); // not twice
    const later = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 16);
    expect(await VI.save(uid, caseId, { stage: "booked", appointment_at: later })).toBeNull(); // moved: reminded again
    await VI.sendDueReminders();
    expect(await db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = $1 AND kind = 'visa_reminder_7'", [email])).toBe(2);
    const ics = VI.ics((await VI.find(caseId))!);
    expect(ics).toContain("SUMMARY:Visa appointment: Massachusetts Institute of Technology");
  });

  it("plans funds from sources and loans, and counts only documented money as ready", async () => {
    const uni = (await A.university("mit"))!;
    const usa = (await A.country("usa"))!;
    const t = F.target(uni, usa);
    expect(t.min_inr).toBeGreaterThan(1000000);
    expect(await F.add(uid, "nope", "x", "5000", 0)).toMatch(/type of funds/);
    expect(await F.add(uid, "savings", "x", "5000", 0)).toMatch(/short name/);
    expect(await F.add(uid, "savings", "Parents savings", "999", 0)).toMatch(/between Rs 1,000/);
    expect(await F.add(uid, "savings", "Parents savings", "Rs 90,00,000", 0)).toBeNull(); // no document yet
    let pool = await F.pool(uid);
    expect(pool).toMatchObject({ documented: 0, planned: 9000000 });
    expect(F.coverage(pool, t.min_inr).status).toBe("planned");
    // a financial document of someone else cannot be attached
    const theirs = await V.upload(other, "financial", { name: "bank.pdf", size: PDF.length, bytes: PDF }, audit);
    expect(await F.add(uid, "family", "Uncle", "50000", theirs as number)).toBeNull();
    expect((await F.sources(uid)).find((s) => s.label === "Uncle")?.document_id).toBeNull();
    finDoc = (await V.upload(uid, "financial", { name: "statement.pdf", size: PDF.length, bytes: PDF }, audit)) as number;
    expect(await F.add(uid, "scholarship", "Merit grant", "1,00,000", finDoc)).toBeNull();
    pool = await F.pool(uid);
    expect(pool.documented).toBe(100000);
    expect(pool.lines.find((l) => l.name === "Merit grant")?.documented).toBe(true);
    const src = (await F.sources(uid)).find((s) => s.label === "Parents savings")!;
    expect(await F.remove(other, src.id)).toBe(false);
    expect(await F.remove(uid, src.id)).toBe(true);
    expect((await F.planTargets(uid))[0].status).toBe("accepted");
    expect((await F.primaryUniversity(uid))?.slug).toBe("mit");
  });

  it("tracks loans, counts a sanctioned loan as documented money, and estimates the EMI", async () => {
    const [bad, errs] = L.validate({ lender: "x", amount_inr: "1", rate_pct: "99" });
    expect(Object.keys(errs).sort()).toEqual(["amount_inr", "lender", "rate_pct"]);
    expect(bad.status).toBe("researching");
    const [v] = L.validate({ lender: "SBI", loan_type: "secured", amount_inr: "2500000", rate_pct: "9.5", tenure_years: "10", moratorium_months: "30", status: "sanctioned", sanctioned_inr: "2000000", checks: ["kyc", "bank"] });
    expect(await L.save(uid, null, v, finDoc)).toBeNull();
    const [loan] = await L.forUser(uid);
    expect(loan).toMatchObject({ lender: "SBI", status: "sanctioned", sanctioned_inr: 2000000, checks: ["kyc", "bank"], document_id: finDoc });
    expect(loan.emi).toEqual(L.emi(2000000, 9.5, 10, 30)); // the EMI uses the sanctioned amount
    const pool = await F.pool(uid);
    expect(pool.lines.find((l) => l.loan)).toMatchObject({ amount: 2000000, documented: true });
    expect(await L.save(uid, loan.id, { ...v, status: "researching", sanctioned_inr: null }, 0)).toBeNull();
    expect((await F.pool(uid)).lines.some((l) => l.loan)).toBe(false); // researching does not count
    expect(await L.save(other, loan.id, v, 0)).toBe("Loan not found.");
    expect(await L.remove(other, loan.id)).toBe(false);
    for (let i = 0; i < L.MAX_LOANS; i++) await L.save(uid, null, v, 0);
    expect(await L.save(uid, null, v, 0)).toMatch(/up to 8 loans/);
    expect(await L.remove(uid, loan.id)).toBe(true);
  });

  it("runs a practice interview from start to feedback", async () => {
    expect(await M.start(uid, "atlantis")).toBe("Choose a country to practise for.");
    const sid = (await M.start(uid, "usa")) as number;
    expect(typeof sid).toBe("number");
    expect(await M.start(uid, "usa")).toBe(sid); // resumes the open session
    const s = (await M.session(sid))!;
    expect(s.qids).toHaveLength(M.QUESTIONS_PER_SESSION);
    expect(new Set(s.qids).size).toBe(M.QUESTIONS_PER_SESSION);
    expect(await M.submit(other, sid, {})).toBe("Practice session not found.");
    expect(await M.submit(uid, sid, {})).toBe("Answer at least one question before you finish.");
    const q = M.question("usa", s.qids[0])!;
    const rich = q.c.map(([, kw]) => kw[0]).join(" ");
    expect(await M.submit(uid, sid, { [s.qids[0]]: rich, [s.qids[1]]: "maybe" })).toBeNull();
    const done = (await M.session(sid))!;
    expect(done.finished_at).not.toBeNull();
    expect(done.score).toBeGreaterThan(0);
    expect((await M.answers(sid))[s.qids[0]].coverage).toBe(100);
    expect(await M.submit(uid, sid, { [s.qids[0]]: "again" })).toBe("This session is already finished.");
    expect(await M.addFeedback(sid, 1, "  ")).toBe("Write your feedback first.");
    expect(await M.addFeedback(sid, (await db.val<number>("SELECT id FROM users LIMIT 1"))!, "Good, be more specific about funding.")).toBeNull();
    expect((await M.feedback(sid))[0].body).toMatch(/specific/);
    expect(await db.val("SELECT COUNT(*) FROM mail_outbox WHERE to_email = $1 AND kind = 'mock_feedback'", [email])).toBe(1);
    const r = await VI.readiness(uid, (await VI.find(caseId))!);
    expect(r.items.find((i) => i[0] === "Mock interview practised")?.[1]).toBe(true);
    expect(await M.remove(other, sid)).toBe(false);
    const open = (await M.start(uid, "usa")) as number;
    expect(open).not.toBe(sid);
    expect(await M.remove(uid, open)).toBe(true);
  });

  it("exports and then erases everything, leaving only the audit trail", async () => {
    const data = await P.exportData(uid);
    expect(Object.keys(data).sort()).toEqual(["applications", "documents", "exported_at", "funds", "journey", "loans", "mock_interviews", "profile", "shortlist", "status_history", "visa_cases"]);
    expect((data.applications as unknown[]).length).toBe(1);
    expect((data.mock_interviews as unknown[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/stored_name|password/);
    await P.erase(uid);
    for (const t of ["sa_profiles", "sa_applications", "sa_documents", "sa_funds", "sa_loans", "sa_mock_sessions", "sa_visa"]) expect(await db.val(`SELECT COUNT(*) FROM ${t} WHERE user_id = $1`, [uid]), t).toBe(0);
    expect(await db.val("SELECT COUNT(*) FROM sa_audit WHERE subject_user_id = $1 AND action = 'data.erase'", [uid])).toBe(1);
    expect(await db.val("SELECT COUNT(*) FROM users WHERE id = $1", [uid])).toBe(1); // the account itself stays
  });
});
