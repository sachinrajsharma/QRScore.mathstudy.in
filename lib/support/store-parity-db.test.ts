import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, DB, emailOf, mkUser, type Boot } from "../pay/test-setup";

/**
 * The stand-alone support-ticket-system features, on a real database: guest tickets reached only through a private link, attachments,
 * spam (quarantine, silent drop, blocklist), merge, delete, categories and CSV. Same setup as store-db.test.ts:
 * PORTAL_TEST_DATABASE_URL=mysql://root@127.0.0.1:3307/growqr_test DATABASE_SSL=disable.
 */
describe.skipIf(!DB)("support ticket parity on a real database", () => {
  let B: Boot;
  let S: typeof import("./store");
  let M: typeof import("./model");
  let admin = 0, member = 0;
  const staff = () => ({ id: admin, name: "supadmin2", email: emailOf("supadmin2") });
  const tag = Math.random().toString(16).slice(2, 8);
  let n = 0;
  const guest = (over: Record<string, string> = {}) => M.guestTicketSchema.parse({ category: "billing", subject: `Guest question ${tag} ${++n}`, related_ref: "ORD-1", body: "I paid for a course but I cannot see it anywhere.", name: "Gita Guest", email: `guest-${tag}-${n}@pay-test.invalid`, phone: "", ...over });
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 10]);

  beforeAll(async () => {
    process.env.STORAGE_DIR = (await import("node:os")).tmpdir() + "/support-parity-" + tag;
    B = await boot();
    S = await import("./store");
    M = await import("./model");
    admin = await mkUser(B.db, "admin", "supadmin2");
    member = await mkUser(B.db, "student", "supmember2");
  });
  afterAll(async () => { await B.db.closePool(); });

  it("opens a guest ticket that only its private link can read", async () => {
    const r = await S.createGuestTicket(guest(), { ip: "203.0.113.1" });
    if (!r.ok || !r.token) throw new Error("create");
    expect(r.no).toMatch(/^SUP-\d{4}-\d{6}$/);
    const view = await S.getByToken(r.token);
    expect(view!.ticket.no).toBe(r.no);
    expect(view!.ticket.userId).toBeNull();
    expect(await S.getByToken("0".repeat(48))).toBeNull();
    expect(await S.getByToken("not-a-token")).toBeNull();
    expect((await S.replyByToken(r.token, "Adding more detail here")).ok).toBe(true);
    expect((await S.replyByToken("1".repeat(48), "nope")).ok).toBe(false);
  });

  it("does not hand a repeat guest submission the existing ticket's token", async () => {
    const input = guest();
    const a = await S.createGuestTicket(input);
    const b = await S.createGuestTicket(input);
    expect(a.ok && b.ok && b.duplicate && b.token === null && a.ok && b.no === a.no).toBe(true);
  });

  it("rejects an unknown or switched-off category", async () => {
    expect((await S.createGuestTicket(guest({ category: "no-such-category" }))).ok).toBe(false);
  });

  it("silently drops a bot (honeypot) and stores nothing", async () => {
    const before = await S.staffList({}, admin);
    const r = await S.createGuestTicket(guest(), { honeypot: "http://spam.example" });
    expect(r.ok && r.dropped).toBe(true);
    const after = await S.staffList({}, admin);
    expect(after.total).toBe(before.total);
  });

  it("quarantines promotional tickets in the spam folder, away from the inbox and the stats", async () => {
    const r = await S.createGuestTicket(guest({ body: "We offer digital marketing, visit https://seo.example to boost your traffic now." }), {});
    if (!r.ok) throw new Error("create");
    expect((await S.staffList({ q: r.no }, admin)).total).toBe(0);
    expect((await S.staffList({ q: r.no, spam: true }, admin)).total).toBe(1);
  });

  it("blocks a sender: the next ticket from that email is dropped", async () => {
    const input = guest({ email: `blocked-${tag}@spamco.invalid` });
    const first = await S.createGuestTicket(input, { ip: "203.0.113.9" });
    if (!first.ok) throw new Error("create");
    expect((await S.staffSpamBlock(staff(), first.no)).ok).toBe(true);
    expect(await S.isBlocked(`someone@spamco.invalid`, "")).toBe(true);
    const again = await S.createGuestTicket(guest({ email: `other-${tag}@spamco.invalid` }));
    expect(again.ok && again.dropped).toBe(true);
    const bl = await S.listBlocklist();
    for (const b of bl.filter((x) => x.value.includes("spamco") || x.value === "203.0.113.9")) await S.unblock(b.id);
    expect(await S.isBlocked(`someone@spamco.invalid`, "")).toBe(false);
  });

  it("stores attachments, serves them to the owner, the link holder and staff only, and logs the download", async () => {
    const r = await S.createGuestTicket(guest(), { files: [{ name: "receipt.pdf", mime: "application/pdf", ext: ".pdf", bytes: PDF }] });
    if (!r.ok || !r.token) throw new Error("create");
    const view = await S.getByToken(r.token);
    const att = view!.messages[0].attachments[0];
    expect(att.name).toBe("receipt.pdf");
    expect((await S.attachmentFor(att.id, { token: r.token }))!.bytes.equals(Buffer.from(PDF))).toBe(true);
    expect(await S.attachmentFor(att.id, {})).toBeNull();
    expect(await S.attachmentFor(att.id, { token: "2".repeat(48) })).toBeNull();
    expect(await S.attachmentFor(att.id, { userId: member })).toBeNull();
    expect((await S.attachmentFor(att.id, { staff: staff() }))).not.toBeNull();
    expect((await S.staffGet(r.no))!.events.some((e) => e.kind === "download")).toBe(true);
  });

  it("merges one ticket into another and refuses merging into itself or a merged ticket", async () => {
    const a = await S.createGuestTicket(guest()); const b = await S.createGuestTicket(guest()); const c = await S.createGuestTicket(guest());
    if (!a.ok || !b.ok || !c.ok) throw new Error("create");
    expect((await S.staffMerge(staff(), a.no, a.no)).ok).toBe(false);
    expect((await S.staffMerge(staff(), a.no, b.no)).ok).toBe(true);
    expect((await S.staffGet(a.no))!.ticket.status).toBe("closed");
    expect((await S.staffGet(a.no))!.ticket.mergedInto).toBe(b.no);
    expect((await S.staffMerge(staff(), c.no, a.no)).ok).toBe(false);
  });

  it("lets staff close then reopen, and only staff can reopen a closed ticket", async () => {
    const r = await S.createGuestTicket(guest());
    if (!r.ok || !r.token) throw new Error("create");
    await S.staffSetStatus(staff(), r.no, "closed");
    expect((await S.replyByToken(r.token, "please reopen this")).ok).toBe(false);
    await S.staffSetStatus(staff(), r.no, "open");
    expect((await S.replyByToken(r.token, "thanks for reopening")).ok).toBe(true);
  });

  it("adds a category, uses it, then switches it off", async () => {
    expect((await S.addCategory("Visa questions", "high")).ok).toBe(true);
    const cat = (await S.listCategories()).find((c) => c.slug === "visa-questions")!;
    const r = await S.createGuestTicket(guest({ category: "visa-questions" }));
    expect(r.ok).toBe(true);
    await S.toggleCategory(cat.id);
    expect((await S.createGuestTicket(guest({ category: "visa-questions" }))).ok).toBe(false);
  });

  it("exports CSV without spam, and deletes a ticket with its files", async () => {
    const r = await S.createGuestTicket(guest({ name: "=cmd Test Person" }), { files: [{ name: "a.pdf", mime: "application/pdf", ext: ".pdf", bytes: PDF }] });
    if (!r.ok || !r.token) throw new Error("create");
    const csv = await S.exportCsv();
    expect(csv.startsWith("﻿ticket_no,")).toBe(true);
    expect(csv).toContain(r.no);
    expect(csv).toContain("'=cmd Test Person");
    expect((await S.staffDelete(staff(), r.no)).ok).toBe(true);
    expect(await S.getByToken(r.token)).toBeNull();
  });
});
