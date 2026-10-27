import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import catalogue from "../market/data/courses.json";
import { boot, DB, emailOf, mkUser, tag, type Boot } from "./test-setup";
import { COURSE_FEE_RUPEES, EXAM_PRODUCTS, STUDIO_COURSES } from "./course-fees";

/** The owner's course fees: seeding, which courses are on sale, and who may study a priced course. */
const cats = (catalogue as unknown as { categories: Record<string, { name: string }> }).categories;
const list = (catalogue as unknown as { courses: Array<{ slug: string; cat: string }> }).courses;

describe("course fee table", () => {
  it("has a fee for every category in the catalogue", () => {
    for (const c of list) expect(COURSE_FEE_RUPEES[cats[c.cat].name], c.slug).toBeGreaterThan(0);
  });
  it("matches the fees the owner gave", () => {
    expect(COURSE_FEE_RUPEES["Blockchain & Web3"]).toBe(799);
    expect(COURSE_FEE_RUPEES["Digital Safety & Life Skills"]).toBe(299);
    expect(EXAM_PRODUCTS.map((e) => [e.sku, e.rupees])).toEqual([["writing-studio", 499]]);
  });
  it("sells the Maths Olympiad one class at a time: 1 to 5 Rs 499, 6 to 8 Rs 599, 9 to 12 Rs 799, all on sale", () => {
    const imo = STUDIO_COURSES.filter((s) => s.slug.startsWith("imo-class-"));
    expect(imo).toHaveLength(12);
    expect(imo.map((s) => s.rupees)).toEqual([499, 499, 499, 499, 499, 599, 599, 599, 799, 799, 799, 799]);
    expect(imo.every((s) => s.onSale)).toBe(true);
    expect(imo.map((s) => s.slug)).toEqual(Array.from({ length: 12 }, (_, i) => `imo-class-${i + 1}`));
  });
});

describe.skipIf(!DB)("course fees on a real database", () => {
  let B: Boot;
  let CAT: typeof import("./catalogue");
  let ACC: typeof import("./course-access");
  let P: typeof import("./orders");
  let C: typeof import("./checkout");
  let rzp: InstanceType<typeof import("./test-support").FakeRazorpay>;
  let alice = 0, bob = 0, courseId = 0;
  const slug = "digital-literacy-master"; // a course with lessons on GrowQR

  beforeAll(async () => {
    B = await boot();
    CAT = await import("./catalogue");
    ACC = await import("./course-access");
    P = await import("./orders");
    C = await import("./checkout");
    rzp = new B.T.FakeRazorpay();
    alice = await mkUser(B.db, "student", "alice");
    bob = await mkUser(B.db, "student", "bob");
    await B.db.run("INSERT IGNORE INTO courses (slug, title, category) VALUES ($1,'Digital Literacy Master','digital')", [slug]);
    courseId = Number(await B.db.val<number>("SELECT id FROM courses WHERE slug = $1", [slug]));
    await CAT.seedCatalogue();
  });
  beforeEach(() => { B.T.setTestEnv(); rzp.install(); });
  afterAll(async () => { rzp.uninstall(); await B.db.closePool(); });

  it("creates one product per course at its category fee, and only courses with lessons are on sale", async () => {
    const rows = await B.db.all<{ sku: string; active: number; amount_minor: number }>("SELECT p.sku, p.active, pr.amount_minor FROM pay_products p JOIN pay_prices pr ON pr.product_id = p.id AND pr.currency = 'INR' WHERE p.sku LIKE 'course-%' AND p.kind = 'course' AND p.sku NOT LIKE 'course-t-%'");
    const mine = rows.filter((r) => list.some((c) => `course-${c.slug}` === r.sku));
    expect(mine.length).toBe(list.length);
    const first = list.find((c) => !STUDIO_COURSES.some((x) => x.slug === c.slug))!;
    expect(mine.find((r) => r.sku === `course-${first.slug}`)?.amount_minor).toBe(COURSE_FEE_RUPEES[cats[first.cat].name] * 100);
    const { nativeSlugs } = await import("../market/lessons");
    for (const r of mine) expect(Boolean(r.active), r.sku).toBe(nativeSlugs().includes(r.sku.slice(7)) || STUDIO_COURSES.some((x) => `course-${x.slug}` === r.sku && x.onSale));
    const vedic = mine.find((r) => r.sku === "course-vedic-mathematics")!;
    expect([vedic.amount_minor, Boolean(vedic.active)]).toEqual([79900, true]); // sold on its own at Rs 799 as well as opened by plans
    const exams = await B.db.all<{ sku: string; active: number }>("SELECT sku, active FROM pay_products WHERE sku = 'writing-studio'");
    expect(exams).toHaveLength(1);
    expect(exams.every((e) => !e.active)).toBe(true);
  });

  it("the Vedic price migration moves only the untouched seeded Rs 399 product to Rs 799 on sale", async () => {
    const sql = (await import("node:fs")).readFileSync("db/migrations/20261218000001_vedic_course_price_799.sql", "utf8").split(";").map((x) => x.replace(/^s*--.*$/gm, "").trim()).filter(Boolean);
    const sku = "course-vedic-mathematics";
    const set = (amount: number, active: number) => B.db.run("UPDATE pay_prices SET amount_minor = $1 WHERE product_id = (SELECT id FROM pay_products WHERE sku = $2) AND currency = 'INR'", [amount, sku]).then(() => B.db.run("UPDATE pay_products SET active = $1 WHERE sku = $2", [active, sku]));
    const state = async () => B.db.one<{ a: number; amount_minor: number }>("SELECT p.active AS a, pr.amount_minor FROM pay_products p JOIN pay_prices pr ON pr.product_id = p.id AND pr.currency = 'INR' WHERE p.sku = $1", [sku]);
    const run = async () => { for (const q of sql) await B.db.run(q, []); };
    await set(39900, 0); await run();
    expect(await state()).toMatchObject({ a: 1, amount_minor: 79900 });
    await set(45000, 0); await run(); // changed in the console: left alone
    expect(await state()).toMatchObject({ a: 0, amount_minor: 45000 });
    await set(79900, 1);
  });

  it("does not overwrite a price that was changed in the console when seeding runs again", async () => {
    await B.db.run("UPDATE pay_prices SET amount_minor = 12300 WHERE product_id = (SELECT id FROM pay_products WHERE sku = $1) AND currency = 'INR'", [`course-${slug}`]);
    await CAT.seedCatalogue();
    expect((await ACC.courseFee(slug))?.amountMinor).toBe(12300);
    await B.db.run("UPDATE pay_prices SET amount_minor = 39900 WHERE product_id = (SELECT id FROM pay_products WHERE sku = $1) AND currency = 'INR'", [`course-${slug}`]);
  });

  it("locks a priced course until it is paid for, then opens it, and a full refund closes it again", async () => {
    expect(await ACC.canStudy(null, courseId, slug)).toBe(false);
    expect(await ACC.canStudy(alice, courseId, slug)).toBe(false);
    const { order, accessToken } = await P.createOrder(P.createOrderSchema.parse({ items: [{ sku: `course-${slug}`, qty: 1 }], country: "IN", billing: { name: "Alice", email: emailOf("alice") } }), { userId: alice });
    expect(order.totalMinor).toBe(39900);
    const started = await C.startCheckout(order.id, { userId: alice, token: accessToken }, { origin: "https://growqr.test", provider: null });
    const rz = (started.checkout as { orderId: string }).orderId;
    rzp.pay(rz);
    await C.confirmPayment(order.id, { userId: alice }, {});
    expect(await ACC.canStudy(alice, courseId, slug)).toBe(true);
    expect(await B.db.one("SELECT 1 AS x FROM course_enrolments WHERE user_id = $1 AND course_id = $2", [alice, courseId])).not.toBeNull();
    expect(await ACC.canStudy(bob, courseId, slug)).toBe(false); // someone else's payment opens nothing for them
    const { requestRefund } = await import("./refunds");
    const staff = await mkUser(B.db, "admin", "fin");
    await requestRefund({ orderPublicId: order.id, reason: "test refund", staffUserId: staff, idempotencyKey: `rf-${tag}-course` });
    const W = await import("./webhooks");
    for (const rf of rzp.refunds.values()) { rzp.processRefund(rf.id); const h = rzp.webhook("refund.processed", { refund: { entity: rf } }, `evt_${tag}_cf`); await W.receiveWebhook("razorpay", h.raw, h.headers); }
    expect(await ACC.canStudy(alice, courseId, slug)).toBe(false);
  });

  it("an enrolment on its own does not open a paid course, and taking a course off sale does not give it away", async () => {
    await B.db.run("INSERT IGNORE INTO course_enrolments (user_id, course_id, status, done_json, progress, started_at, updated_at) VALUES ($1,$2,'enrolled','[]',0,NOW(),NOW())", [bob, courseId]);
    expect(await ACC.canStudy(bob, courseId, slug)).toBe(false);
    await B.db.run("UPDATE pay_products SET active = 0 WHERE sku = $1", [`course-${slug}`]);
    expect(await ACC.canStudy(null, courseId, slug)).toBe(false);
    expect(await ACC.courseFee(slug)).toBeNull(); // no longer purchasable
    await B.db.run("UPDATE pay_products SET active = 1 WHERE sku = $1", [`course-${slug}`]);
  });

  it("sells each Maths Olympiad class on its own: priced by grade band, locked for everyone until bought, and one class opens nothing else", async () => {
    const rows = await B.db.all<{ sku: string; amount_minor: number; active: number }>("SELECT p.sku, pr.amount_minor, p.active FROM pay_products p JOIN pay_prices pr ON pr.product_id = p.id AND pr.currency = 'INR' WHERE p.sku LIKE 'course-imo-class-%'");
    const by = Object.fromEntries(rows.map((r) => [r.sku, r]));
    for (let n = 1; n <= 12; n++) expect([by[`course-imo-class-${n}`]?.amount_minor, Boolean(by[`course-imo-class-${n}`]?.active)], `class ${n}`).toEqual([(n <= 5 ? 499 : n <= 8 ? 599 : 799) * 100, true]);
    expect(await ACC.accessFor(null, "imo-class-7")).toBeNull();
    expect(await ACC.accessFor(alice, "imo-class-7")).toBeNull();
    const { order, accessToken } = await P.createOrder(P.createOrderSchema.parse({ items: [{ sku: "course-imo-class-7", qty: 1 }], country: "IN", billing: { name: "Alice", email: emailOf("alice") } }), { userId: alice });
    expect(order.totalMinor).toBe(59900);
    const started = await C.startCheckout(order.id, { userId: alice, token: accessToken }, { origin: "https://growqr.test", provider: null });
    rzp.pay((started.checkout as { orderId: string }).orderId);
    await C.confirmPayment(order.id, { userId: alice }, {});
    expect(await ACC.accessFor(alice, "imo-class-7")).toBe("purchase");
    expect(await ACC.accessFor(alice, "imo-class-8")).toBeNull(); // another class stays locked
    expect(await ACC.accessFor(bob, "imo-class-7")).toBeNull(); // so does someone else's account
  });

  it("sells the five overseas education packages as staff-delivered products at fixed fees", async () => {
    const rows = await B.db.all<{ sku: string; kind: string; amount_minor: number; active: number }>("SELECT p.sku, p.kind, pr.amount_minor, p.active FROM pay_products p JOIN pay_prices pr ON pr.product_id = p.id AND pr.currency = 'INR' WHERE p.sku LIKE 'abroad-%'");
    expect(rows.map((r) => [r.sku, r.kind, r.amount_minor, Boolean(r.active)]).sort()).toEqual([
      ["abroad-application-pro", "consulting", 799900, true],
      ["abroad-discovery", "consulting", 199900, true],
      ["abroad-global-guardian", "consulting", 5599900, true],
      ["abroad-global-success", "consulting", 2799900, true],
      ["abroad-incubator", "consulting", 1499900, true],
    ]);
  });

  it("sells each exam-preparation product at the owner's price, GMAT held back until its lessons exist", async () => {
    const rows = await B.db.all<{ sku: string; amount_minor: number; active: number }>("SELECT p.sku, pr.amount_minor, p.active FROM pay_products p JOIN pay_prices pr ON pr.product_id = p.id AND pr.currency = 'INR' WHERE p.sku LIKE 'course-exam-%'");
    const by = Object.fromEntries(rows.map((r) => [r.sku, [r.amount_minor / 100, Boolean(r.active)]]));
    expect(by).toEqual({ "course-exam-jee": [999, true], "course-exam-neet": [999, true], "course-exam-upsc": [1599, true], "course-exam-ssc-cgl": [899, true], "course-exam-cat-quant": [599, true], "course-exam-sat-math": [1299, true], "course-exam-gre": [1599, true], "course-exam-gmat": [1599, false], "course-exam-ielts": [1299, true], "course-exam-ap-calculus": [1299, true] });
  });

  it("leaves a course with no fee free", async () => {
    expect(await ACC.canStudy(null, 1, "a-course-nobody-priced")).toBe(true);
  });
});
