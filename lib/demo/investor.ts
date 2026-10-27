import "server-only";
import bcrypt from "bcryptjs";
import { one, run, val } from "../portal/db";
import { hashPassword } from "../portal/password";
import { hashToken, newAccessToken, newOrderId } from "../pay/ids";

/**
 * A ready-made, READ-ONLY student login for showing the whole product to investors and senior reviewers on a non-live site. It is flagged `is_demo`, so
 * the same edge guard that protects the demo administrator blocks every change and download from it (see lib/portal/demo.ts). Everything is dummy data:
 * the two "purchases" are labelled demo_ in the payment tables and no money moved. Run from Console > Demo student; safe to run again (it rebuilds).
 */
export const DEMO_EMAIL = "delhi@demo.com";
export const DEMO_PASSWORD = "Delhi@2026";
export const DEMO_CONSULTANT_EMAIL = "consultant.demo@growqr.demo";
export const DEMO_PLAN_SKU = "plan-pro-monthly"; // Rs 599
export const DEMO_OVERSEAS_SKU = "abroad-incubator"; // Overseas level 3, Academic & Admission Incubator

const DAY = 86_400_000;
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const file = (name: string) => ({ name, size: PDF.length, bytes: PDF });

export interface DemoResult { ok: boolean; message: string; email: string; password: string; steps: string[] }

/** Delete the demo student, the demo consultant and everything attached to them. Refuses to touch an address that is not a demo account. */
export async function removeInvestorDemo(): Promise<string> {
  let removed = 0;
  for (const email of [DEMO_EMAIL, DEMO_CONSULTANT_EMAIL]) {
    const u = await one<{ id: number; is_demo: number }>("SELECT id, is_demo FROM users WHERE email = $1", [email]);
    if (!u) continue;
    if (!u.is_demo) throw new Error(`${email} is a real account, so it was left alone.`);
    await run("DELETE FROM pay_payments WHERE order_id IN (SELECT id FROM pay_orders WHERE user_id = $1)", [u.id]);
    await run("DELETE FROM pay_entitlements WHERE user_id = $1", [u.id]);
    await run("DELETE FROM pay_invoices WHERE order_id IN (SELECT id FROM pay_orders WHERE user_id = $1)", [u.id]);
    await run("DELETE FROM pay_orders WHERE user_id = $1", [u.id]);
    await run("DELETE FROM users WHERE id = $1", [u.id]); // cascades to sessions, profile, journey, notifications
    removed++;
  }
  return removed ? "The demo accounts and their data were removed." : "There was no demo account to remove.";
}

async function demoOrder(userId: number, email: string, name: string, sku: string, daysAgo: number, expiresInDays: number | null): Promise<string> {
  const p = await one<{ id: number; kind: string; title: string; fulfil_ref: string; access_days: number | null; amount_minor: number }>(
    "SELECT p.id, p.kind, p.title, p.fulfil_ref, p.access_days, r.amount_minor FROM pay_products p JOIN pay_prices r ON r.product_id = p.id AND r.currency = 'INR' AND r.active = 1 WHERE p.sku = $1", [sku]);
  if (!p) throw new Error(`The product ${sku} is not in the catalogue yet. Open Console > Payments > Catalogue once, then try again.`);
  const pub = newOrderId();
  const amt = Number(p.amount_minor);
  const ago = `DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${Math.trunc(daysAgo)} DAY)`;
  const oid = Number(await val(`INSERT INTO pay_orders (public_id, user_id, email, status, currency, subtotal_minor, discount_minor, tax_minor, total_minor, tax_inclusive, tax_name, tax_rate_bp, country, billing_name, billing_json, access_token_hash, expires_at, paid_at, fulfilled_at, created_at) VALUES ($1,$2,$3,'fulfilled','INR',$4,0,0,$4,1,'',0,'IN',$5,$6,$7, ${ago}, ${ago}, ${ago}, ${ago}) RETURNING id`,
    [pub, userId, email, amt, name, '{"demo":true}', hashToken(newAccessToken())]));
  const item = Number(await val("INSERT INTO pay_order_items (order_id, product_id, sku, kind, title, fulfil_ref, access_days, qty, unit_minor, discount_minor, tax_minor, total_minor) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,0,0,$8) RETURNING id",
    [oid, p.id, sku, p.kind, p.title, p.fulfil_ref, p.access_days, amt]));
  await run(`INSERT INTO pay_payments (order_id, provider, provider_session_ref, provider_payment_ref, status, amount_minor, currency, method, idempotency_key, settled_at, created_at) VALUES ($1,'razorpay',$2,$3,'succeeded',$4,'INR','upi',$5, ${ago}, ${ago})`,
    [oid, `demo_session_${pub}`, `demo_payment_${pub}`, amt, `${pub}:1`]);
  const until = expiresInDays === null ? "NULL" : `DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${Math.trunc(expiresInDays)} DAY)`;
  await run(`INSERT INTO pay_entitlements (order_id, order_item_id, user_id, email, product_id, kind, ref, status, starts_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'active', ${ago}, ${until})`,
    [oid, item, userId, email, p.id, p.kind, p.fulfil_ref]);
  return `${p.title} (Rs ${(amt / 100).toLocaleString("en-IN")})`;
}

export async function createInvestorDemo(): Promise<DemoResult> {
  const steps: string[] = [];
  try {
    const { seedCatalogue } = await import("../pay/catalogue");
    await seedCatalogue();
    steps.push(await removeInvestorDemo());

    const hash = await hashPassword(DEMO_PASSWORD);
    const student = Number(await val("INSERT INTO users (role, email, password_hash, name, email_verified_at, created_at, is_demo) VALUES ('student', $1, $2, 'Investor Demo (student)', NOW(), NOW(), 1) RETURNING id", [DEMO_EMAIL, hash]));
    const consultant = Number(await val("INSERT INTO users (role, email, password_hash, name, email_verified_at, created_at, is_demo) VALUES ('counselor', $1, $2, 'Rhea Kapoor (demo consultant)', NOW(), NOW(), 1) RETURNING id", [DEMO_CONSULTANT_EMAIL, await bcrypt.hash(newAccessToken(), 10)]));
    steps.push("Created the demo student and a demo consultant (nobody can sign in as the consultant).");

    steps.push("Purchase 1: " + await demoOrder(student, DEMO_EMAIL, "Investor Demo", DEMO_PLAN_SKU, 12, 120));
    steps.push("Purchase 2: " + await demoOrder(student, DEMO_EMAIL, "Investor Demo", DEMO_OVERSEAS_SKU, 9, null));

    await run("INSERT INTO sa_profiles (user_id, level, field, score_type, score_value, academic_index, english_test, english_score, budget_inr, countries, intake, goal, stage, consent_at, consent_version, created_at, updated_at) VALUES ($1,'PG','Data Science','percentage',76,76,'IELTS',7.0,2800000,'uk','Fall 2027','Study abroad','DOC_COLLECTION',NOW(),'2026-10',NOW(),NOW())", [student]);
    steps.push("Added a study-abroad profile (MSc Data Science, UK, Fall 2027).");

    const ST = await import("../journey/store"); const SV = await import("../journey/service"); const AP = await import("../journey/apps"); const WS = await import("../journey/workspace"); const NT = await import("../journey/notify"); const DC = await import("../journey/docs");
    const S = { id: student, role: "student" as const };
    const A = { id: consultant, role: "admin" as const };
    const c = await ST.createCase(student, { destination: "uk", degree: "PG", intake: "Fall 2027", needsLoan: true, needsAccommodation: true, hasWorkExperience: true, wantsScholarship: true, wantsInternship: true, wantsPartTime: true }, S, new Date(Date.now() - 5 * DAY));
    await WS.assign(c, consultant, A, "Initial assignment by the admissions desk");
    await SV.runAutoChecks(c);
    const key = async (k: string) => (await ST.loadCase(c))!.tasks.find((t) => t.taskKey === k && t.applicationId === null)!;
    // Work through the opening steps the way a diligent student would: start, record the evidence the step asks for, complete. A step that needs something
    // we cannot honestly fake (for example a verified upload) is simply left where it is.
    const doneAll = async (prefix: string, limit: number) => {
      const keys = (await ST.loadCase(c))!.tasks.filter((t) => t.applicationId === null && t.taskKey.startsWith(prefix)).map((t) => t.taskKey).slice(0, limit);
      let n = 0;
      for (const k of keys) {
        const t = await key(k);
        if (await SV.moveTask(t.id, S, "in_progress")) continue;
        let ok = true;
        for (const r of t.evidenceReq) {
          const err = r.kind === "text" ? await SV.addNoteEvidence(t.id, S, "text", "Recorded during the counselling call (demo data).")
            : r.kind === "link" ? await SV.addNoteEvidence(t.id, S, "link", "https://www.example.com/demo-evidence")
            : r.kind === "confirmation" ? await SV.addNoteEvidence(t.id, S, "confirmation", "DEMO-CONFIRMATION-001") : "needs a document";
          if (err) ok = false;
        }
        if (ok && !(await SV.moveTask(t.id, S, "completed", "Done and recorded"))) n++;
      }
      return n;
    };
    const d1 = await doneAll("s1.", 10);
    steps.push(`Completed ${d1} opening steps of stage 1 with recorded evidence.`);
    const tr = await key("s2.transcripts"); await SV.moveTask(tr.id, S, "in_progress");
    try {
      const d = await DC.upload(c, S, { docKey: "transcripts", taskId: tr.id }, file("transcripts-sem1-6.pdf"));
      if (typeof d === "number") await SV.moveTask(tr.id, S, "submitted_for_review", "All six semesters attached");
      await DC.upload(c, S, { docKey: "passport", expiresOn: new Date(Date.now() + 900 * DAY).toISOString().slice(0, 10) }, file("passport.pdf"));
      await DC.upload(c, S, { docKey: "cv" }, file("cv.pdf"));
      steps.push("Uploaded sample documents (one transcript is waiting for the consultant's review).");
    } catch { steps.push("Sample documents were skipped (file storage is not writable here); everything else was created."); }
    const bk = await key("s2.backlogs"); await SV.moveTask(bk.id, S, "in_progress");
    for (const [u, p, cat] of [["University of Leeds", "MSc Data Science", "target"], ["University of Edinburgh", "MSc Artificial Intelligence", "ambitious"], ["Coventry University", "MSc Data Science and Computational Intelligence", "safer"]] as const)
      await AP.addApplication(c, S, { uniName: u, programme: p, intake: "Fall 2027", category: cat });
    await NT.notify({ userId: student, caseId: c, kind: "reminder", title: "Due in 3 days: Book your English test", body: "Book early so you can still retake it.", link: "/abroad/journey", dedupe: "investor-demo:1", email: false });
    steps.push("Built the 12-stage journey with progress, three university applications, a consultant and a reminder.");

    return { ok: true, message: "The investor demo student is ready.", email: DEMO_EMAIL, password: DEMO_PASSWORD, steps };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong while creating the demo.", email: DEMO_EMAIL, password: DEMO_PASSWORD, steps };
  }
}
