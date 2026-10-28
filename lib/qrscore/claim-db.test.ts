import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { boot, DB, mkUser, tag, type Boot } from "../pay/test-setup";
import { isScored, scoreText } from "./index";
import { summarize, type GuestScan } from "./guest";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RESUME = `Meera Iyer
meera.iyer.demo@example.com | +91 90000 11111 | Chennai

EDUCATION
B.Com, Loyola College, Chennai, 2021 - 2024, 78%

EXPERIENCE
Accounts Intern, Cresta Capital, Mumbai (May 2024 - Jul 2024)
- Reconciled 300+ vendor invoices and cut month-end close time by 20%
- Built an Excel model that tracked 12 cost centres

SKILLS
Technical: Excel, Tally, Financial Modeling
Soft: Communication

CERTIFICATIONS
Tally Prime Certification (2024)
`;

/** Saving a visitor's scanned resume to their new account: the saved result, the QR ID, and the public QR page only when asked and possible. */
describe.skipIf(!DB)("claiming a scanned resume", () => {
  let B: Boot;
  let C: typeof import("./claim");
  let scan: GuestScan;
  const ids: number[] = [];

  const student = async (label: string): Promise<number> => {
    const id = await mkUser(B.db, "student", `${label}-${tag}`);
    await B.db.run("INSERT INTO student_profiles (user_id, college) VALUES ($1, '') ON CONFLICT DO NOTHING", [id]);
    ids.push(id);
    return id;
  };

  beforeAll(async () => {
    B = await boot();
    C = await import("./claim");
    const r = scoreText(RESUME);
    if (!isScored(r)) throw new Error("sample resume refused");
    scan = summarize(r, RESUME, { name: "Meera-Resume.txt", mime: "text/plain", size: RESUME.length });
  });
  beforeEach(() => { B.T.setTestEnv(); delete process.env.PASSPORT_SIGNING_SEED; });
  afterAll(async () => { await B.db.closePool(); });

  it("gives a student one readable QR ID and never changes it", async () => {
    const u = await student("qrid");
    const a = await C.assignQrId(u, "Meera Iyer");
    expect(a).toMatch(/^GQ-MEERA-\d{4}$/);
    expect(await C.assignQrId(u, "Someone Else")).toBe(a);
    expect(await B.db.val("SELECT qr_id FROM student_profiles WHERE user_id = $1", [u])).toBe(a);
  });

  it("keeps every QR ID unique even when two people share a name", async () => {
    const made = new Set<string>();
    for (let i = 0; i < 12; i++) made.add(await C.assignQrId(await student(`dup${i}`), "Meera Iyer"));
    expect(made.size).toBe(12);
  });

  it("saves the scored resume as the student's passport and current resume", async () => {
    const u = await student("save");
    const out = await C.attachGuestScan(u, "Meera Iyer", scan, { publish: false });
    expect(out.published).toBe(false);
    expect(out.qrId).toMatch(/^GQ-MEERA-\d{4}$/);
    expect(out.score).toBeCloseTo(scan.score, 0);
    const p = await B.db.one("SELECT rq_overall, resume_name, resume_text FROM student_profiles WHERE user_id = $1", [u]);
    expect(Number(p!.rq_overall)).toBeCloseTo(scan.score, 0);
    expect(p!.resume_name).toBe("Meera-Resume.txt");
    expect(String(p!.resume_text)).toContain("Loyola College");
    expect(Number(await B.db.val("SELECT COUNT(*) FROM resumes WHERE user_id = $1 AND is_current = 1", [u]))).toBe(1);
    expect(await B.db.val("SELECT COUNT(*) FROM passports WHERE user_id = $1 AND is_public = 1", [u])).toBe(0);
  });

  it("makes the QR page public only when asked and passport signing is set up", async () => {
    const withKey = await student("pub");
    process.env.PASSPORT_SIGNING_SEED = "test-signing-seed-0123456789-abcdefghij";
    const a = await C.attachGuestScan(withKey, "Meera Iyer", scan, { publish: true });
    expect(a.published).toBe(true);
    const row = await B.db.one("SELECT is_public, display_name, show_skills, show_college FROM passports WHERE user_id = $1", [withKey]);
    expect(row).toMatchObject({ is_public: 1, display_name: "Meera I." });
    expect(Number(row!.show_skills)).toBe(0);
    expect(Number(row!.show_college)).toBe(0);

    const noKey = await student("nokey");
    delete process.env.PASSPORT_SIGNING_SEED;
    expect((await C.attachGuestScan(noKey, "Meera Iyer", scan, { publish: true })).published).toBe(false);

    const declined = await student("declined");
    process.env.PASSPORT_SIGNING_SEED = "test-signing-seed-0123456789-abcdefghij";
    expect((await C.attachGuestScan(declined, "Meera Iyer", scan, { publish: false })).published).toBe(false);
  });
});
