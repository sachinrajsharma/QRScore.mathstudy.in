import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { boot, DB, type Boot } from "../pay/test-setup";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** The investor demo student: it is read-only, owns exactly the two purchases, has a real journey, rebuilds cleanly and never touches a real account. */
describe.skipIf(!DB)("investor demo student", () => {
  let B: Boot;
  let D: typeof import("./investor");

  beforeAll(async () => { B = await boot(); D = await import("./investor"); });
  beforeEach(() => { B.T.setTestEnv(); });
  afterAll(async () => { await D.removeInvestorDemo(); await B.db.closePool(); });

  it("creates a read-only student with the Pro plan, an overseas package and a journey", async () => {
    const r = await D.createInvestorDemo();
    expect(r.ok, r.message).toBe(true);
    const u = await B.db.one("SELECT id, role, is_demo, email_verified_at FROM users WHERE email = $1", [D.DEMO_EMAIL]);
    expect(u).toMatchObject({ role: "student", is_demo: 1 });
    expect(u!.email_verified_at).not.toBeNull();
    const ent = await B.db.all("SELECT e.kind, e.ref, e.status, i.sku, i.total_minor FROM pay_entitlements e JOIN pay_order_items i ON i.id = e.order_item_id WHERE e.user_id = $1 ORDER BY e.id", [u!.id]);
    expect(ent.map((e) => [e.sku, Number(e.total_minor), e.status])).toEqual([["plan-pro-monthly", 59900, "active"], ["abroad-incubator", 1499900, "active"]]);
    expect(ent.map((e) => `${e.kind}:${e.ref}`)).toEqual(["plan:pro", "consulting:incubator"]);
    const paid = await B.db.all("SELECT p.provider_payment_ref, p.status FROM pay_payments p JOIN pay_orders o ON o.id = p.order_id WHERE o.user_id = $1", [u!.id]);
    expect(paid.length).toBe(2);
    expect(paid.every((p) => String(p.provider_payment_ref).startsWith("demo_payment_") && p.status === "succeeded")).toBe(true);
    const tasks = await B.db.val("SELECT COUNT(*) FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE c.user_id = $1", [u!.id]);
    expect(Number(tasks)).toBeGreaterThan(80);
    const done = await B.db.val("SELECT COUNT(*) FROM oj_tasks t JOIN oj_cases c ON c.id = t.case_id WHERE c.user_id = $1 AND t.status = 'completed'", [u!.id]);
    expect(Number(done)).toBeGreaterThan(0);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM oj_applications a JOIN oj_cases c ON c.id = a.case_id WHERE c.user_id = $1", [u!.id]))).toBe(3);
    const { activePlan } = await import("../pay/entitlements");
    expect(await activePlan(u!.id)).toBe("pro");
  });

  it("rebuilds without duplicating anything, and the password is the published one", async () => {
    await D.createInvestorDemo();
    const again = await D.createInvestorDemo();
    expect(again.ok, again.message).toBe(true);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM users WHERE email = $1", [D.DEMO_EMAIL]))).toBe(1);
    const u = await B.db.one("SELECT id, password_hash FROM users WHERE email = $1", [D.DEMO_EMAIL]);
    const { verifyPassword } = await import("../portal/password");
    expect(await verifyPassword(D.DEMO_PASSWORD, u!.password_hash)).toBe(true);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM pay_orders WHERE user_id = $1", [u!.id]))).toBe(2);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM oj_cases WHERE user_id = $1", [u!.id]))).toBe(1);
  });

  it("refuses to overwrite or delete a real account that uses the demo address", async () => {
    await D.removeInvestorDemo();
    await B.db.run("INSERT INTO users (role, email, password_hash, name, email_verified_at, created_at, is_demo) VALUES ('student', $1, 'x', 'Real person', NOW(), NOW(), 0)", [D.DEMO_EMAIL]);
    const r = await D.createInvestorDemo();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/real account/);
    expect(await B.db.val("SELECT name FROM users WHERE email = $1", [D.DEMO_EMAIL])).toBe("Real person");
    await B.db.run("DELETE FROM users WHERE email = $1", [D.DEMO_EMAIL]);
  });

  it("removes the demo accounts, orders and journey together", async () => {
    await D.createInvestorDemo();
    const id = Number(await B.db.val("SELECT id FROM users WHERE email = $1", [D.DEMO_EMAIL]));
    await D.removeInvestorDemo();
    expect(await B.db.one("SELECT id FROM users WHERE email IN ($1, $2)", [D.DEMO_EMAIL, D.DEMO_CONSULTANT_EMAIL])).toBeNull();
    expect(Number(await B.db.val("SELECT COUNT(*) FROM pay_orders WHERE user_id = $1", [id]))).toBe(0);
    expect(Number(await B.db.val("SELECT COUNT(*) FROM oj_cases WHERE user_id = $1", [id]))).toBe(0);
  });
});
