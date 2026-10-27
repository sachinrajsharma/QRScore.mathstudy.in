import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { boot, DB } from "../pay/test-setup";

/**
 * Local demo data for the journey screens. NOT a test: it only runs when JOURNEY_DEMO_SEED=<file> is set, and writes the generated logins to that file.
 *   JOURNEY_DEMO_SEED=C:\path\logins.txt PORTAL_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/growqr_test DATABASE_SSL=disable npx vitest run lib/journey/demo-seed.test.ts
 * It creates *.localhost.test users on the local scratch database only.
 */
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });
const OUT = process.env.JOURNEY_DEMO_SEED;
const lap = (m: string) => console.log("[seed]", m, new Date().toISOString().slice(11, 19));
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const pw = (): string => Array.from({ length: 16 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const file = (name: string) => ({ name, size: PDF.length, bytes: PDF });
const DAY = 86_400_000;

describe.skipIf(!DB || !OUT)("journey demo data", () => {
  it("seeds students, a consultant and an administrator", async () => {
    lap("start");
    const B = await boot();
    lap("booted");
    process.env.STORAGE_DIR = process.env.STORAGE_DIR ?? path.resolve("storage");
    const ST = await import("./store"); const SV = await import("./service"); const AP = await import("./apps"); const DC = await import("./docs"); const WS = await import("./workspace"); const NT = await import("./notify");
    const logins: string[] = ["Local demo logins (localhost only). Generated " + new Date().toISOString()];
    const mk = async (email: string, name: string, role: string) => {
      const password = pw();
      await B.db.run("DELETE FROM users WHERE email = $1", [email]);
      const id = Number(await B.db.val("INSERT INTO users (role, email, password_hash, name, email_verified_at, created_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id", [role, email, await bcrypt.hash(password, 10), name]));
      logins.push(`${role.padEnd(10)} ${email}  ${password}`);
      return id;
    };
    const aarav = await mk("aarav@journey.localhost.test", "Aarav Sharma", "student");
    const meera = await mk("meera@journey.localhost.test", "Meera Iyer", "student");
    const kabir = await mk("kabir@journey.localhost.test", "Kabir Nair", "student");
    const rhea = await mk("rhea@journey.localhost.test", "Rhea Kapoor (consultant)", "counselor");
    const admin = await mk("admin@journey.localhost.test", "Admin Demo", "admin");
    const S = (id: number) => ({ id, role: "student" as const });
    const C = { id: rhea, role: "counselor" as const };
    const A = { id: admin, role: "admin" as const };
    for (const [uid, field] of [[aarav, "Computer Science"], [meera, "Business"]] as const)
      await B.db.run("INSERT INTO sa_profiles (user_id, level, field, score_type, score_value, academic_index, english_test, english_score, budget_inr, countries, intake, goal, stage, consent_at, consent_version, created_at, updated_at) VALUES ($1,'PG',$2,'percentage',74,74,'IELTS',6.5,2500000,'uk','Fall 2027','Study abroad','DOC_COLLECTION',NOW(),'2026-10',NOW(),NOW())", [uid, field]);

    lap("users");
    // Aarav: UK Master's, started 45 days ago, mid-way
    const ca = await ST.createCase(aarav, { destination: "uk", degree: "PG", intake: "Fall 2027", needsLoan: true, needsAccommodation: true, hasWorkExperience: true, wantsScholarship: true }, S(aarav), new Date(Date.now() - 45 * DAY));
    await WS.assign(ca, rhea, A, "Initial assignment by the admissions desk");
    await SV.runAutoChecks(ca);
    const key = async (k: string, app: number | null = null, id = ca) => (await ST.loadCase(id))!.tasks.find((t) => t.taskKey === k && t.applicationId === app)!;
    const doS = async (k: string, text: string, who = S(aarav), id = ca) => { const t = await key(k, null, id); await SV.moveTask(t.id, who, "in_progress"); for (const r of t.evidenceReq) if (r.kind === "text") await SV.addNoteEvidence(t.id, who, "text", text); return SV.moveTask(t.id, who, "completed", "Done and recorded"); };
    await doS("s1.goals", "MSc in data science, budget up to 25 lakh, wants a post-study work route");
    const t = await key("s1.call_booked"); await SV.moveTask(t.id, S(aarav), "in_progress"); await SV.addNoteEvidence(t.id, S(aarav), "text", "Booked for 2 Nov, 4 pm IST"); await SV.moveTask(t.id, S(aarav), "completed", "Booked on the counselling page");
    const t2 = await key("s2.transcripts"); await SV.moveTask(t2.id, S(aarav), "in_progress");
    const d = (await DC.upload(ca, S(aarav), { docKey: "transcripts", taskId: t2.id }, file("transcripts-sem1-6.pdf"))) as number;
    await SV.moveTask(t2.id, S(aarav), "submitted_for_review", "All six semesters attached");
    const t3 = await key("s2.backlogs"); await SV.moveTask(t3.id, S(aarav), "in_progress");
    await DC.upload(ca, S(aarav), { docKey: "passport", expiresOn: new Date(Date.now() + 900 * DAY).toISOString().slice(0, 10) }, file("passport.pdf"));
    await DC.upload(ca, S(aarav), { docKey: "cv" }, file("cv-v1.pdf"));
    await DC.upload(ca, S(aarav), { docKey: "cv" }, file("cv-v2.pdf"));
    for (const [u, p, cat] of [["University of Leeds", "MSc Data Science", "target"], ["University of Edinburgh", "MSc Artificial Intelligence", "ambitious"], ["Coventry University", "MSc Data Science and Computational Intelligence", "safer"]] as const) await AP.addApplication(ca, S(aarav), { uniName: u, programme: p, intake: "Fall 2027", category: cat });
    void d;

    lap("aarav done");
    // Meera: USA undergraduate, owns a paid package (real payment flow with the fake provider)
    const cm = await ST.createCase(meera, { destination: "usa", degree: "UG", intake: "Spring 2028", englishExempt: true, entranceTestNeeded: true, wantsInternship: true }, S(meera), new Date(Date.now() - 20 * DAY));
    await WS.assign(cm, rhea, A, "Initial assignment by the admissions desk");
    await SV.runAutoChecks(cm);
    await doS("s1.goals", "BBA with an internship year, SAT planned in March", S(meera), cm);
    const { seedCatalogue } = await import("../pay/catalogue");
    await seedCatalogue();
    const T = await import("../pay/test-support");
    const rzp = new T.FakeRazorpay();
    const { buy } = await import("../pay/test-setup");
    rzp.install();
    await buy(rzp, meera, "meera@journey.localhost.test", "abroad-application-pro");
    rzp.uninstall();
    await NT.notify({ userId: meera, caseId: cm, kind: "reminder", title: "Due in 3 days: Book your English test", body: "Book early so you can still retake it.", link: "/abroad/journey", dedupe: "demo:1", email: false });

    lap("meera done");
    // Kabir: new, waiting for a consultant
    await ST.createCase(kabir, { destination: "canada", degree: "PG", intake: "Fall 2027", needsFunding: true }, S(kabir), new Date(Date.now() - 3 * DAY));
    await SV.runAutoChecks((await ST.caseOfUser(kabir))!.id);
    void C;
    await NT.runSweep();
    writeFileSync(OUT as string, logins.join("\n") + "\n");
    expect(logins.length).toBe(6);
  });
});
