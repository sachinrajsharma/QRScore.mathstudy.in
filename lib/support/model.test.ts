import { describe, expect, it } from "vitest";
import { LIMITS, canRate, canUserReply, isTicketNo, newTicketSchema, ratingSchema, replySchema, shouldAutoClose, statusAfterStaffReply, statusAfterUserReply, ticketNo } from "./model";

const good = { category: "billing", subject: "Payment taken twice", related_ref: "", body: "I was charged twice for the same course today." };

describe("support ticket rules", () => {
  it("numbers tickets SUP-YYYY-NNNNNN and recognises only that shape", () => {
    expect(ticketNo(42, new Date("2026-03-01T00:00:00Z"))).toBe("SUP-2026-000042");
    expect(isTicketNo("SUP-2026-000042")).toBe(true);
    for (const bad of ["SUP-26-000042", "sup-2026-000042", "SUP-2026-42", "SUP-2026-000042; DROP TABLE users", ""]) expect(isTicketNo(bad)).toBe(false);
  });

  it("validates a new ticket and strips control characters", () => {
    expect(newTicketSchema.safeParse(good).success).toBe(true);
    expect(newTicketSchema.safeParse({ ...good, category: "Not a slug!" }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...good, subject: "hi" }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...good, body: "short" }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...good, body: "x".repeat(8001) }).success).toBe(false);
    const r = newTicketSchema.parse({ ...good, subject: "  Hello\u0000 world  " });
    expect(r.subject).toBe("Hello world");
  });

  it("validates replies and ratings", () => {
    expect(replySchema.safeParse({ body: "" }).success).toBe(false);
    expect(replySchema.safeParse({ body: "Thanks" }).success).toBe(true);
    expect(ratingSchema.safeParse({ rating: "5" }).success).toBe(true);
    expect(ratingSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(ratingSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it("moves status the way a conversation does", () => {
    expect(statusAfterUserReply("waiting_user")).toBe("open");
    expect(statusAfterUserReply("resolved")).toBe("open");
    expect(statusAfterUserReply("pending")).toBe("pending");
    expect(statusAfterUserReply("closed")).toBeNull();
    expect(statusAfterStaffReply("open")).toBe("waiting_user");
    expect(statusAfterStaffReply("pending")).toBe("pending");
    expect(canUserReply("closed")).toBe(false);
    expect(canUserReply("open")).toBe(true);
    expect(canRate("resolved", null)).toBe(true);
    expect(canRate("resolved", 4)).toBe(false);
    expect(canRate("open", null)).toBe(false);
  });

  it("auto-closes only quiet waiting or resolved tickets", () => {
    const now = new Date("2026-06-20T00:00:00Z");
    const old = new Date(now.getTime() - (LIMITS.idleCloseDays + 1) * 86_400_000);
    const fresh = new Date(now.getTime() - 86_400_000);
    expect(shouldAutoClose("waiting_user", old, now)).toBe(true);
    expect(shouldAutoClose("resolved", old, now)).toBe(true);
    expect(shouldAutoClose("waiting_user", fresh, now)).toBe(false);
    expect(shouldAutoClose("open", old, now)).toBe(false);
    expect(shouldAutoClose("pending", old, now)).toBe(false);
  });
});

import { guestTicketSchema, idleCloseHours, isAccessToken, normaliseTicketNo } from "./model";

describe("guest tickets and settings", () => {
  const guest = { category: "billing", subject: "Payment taken twice", related_ref: "", body: "I was charged twice for the same course today.", name: "Asha Verma", email: "Asha@Example.com ", phone: "" };
  it("validates a guest ticket and lower-cases the email", () => {
    const r = guestTicketSchema.parse(guest);
    expect(r.email).toBe("asha@example.com");
    expect(guestTicketSchema.safeParse({ ...guest, name: "http://spam.example" }).success).toBe(false);
    expect(guestTicketSchema.safeParse({ ...guest, name: "Bot 123456" }).success).toBe(false);
    expect(guestTicketSchema.safeParse({ ...guest, email: "not an email" }).success).toBe(false);
    expect(guestTicketSchema.safeParse({ ...guest, phone: "12" }).success).toBe(false);
    expect(guestTicketSchema.safeParse({ ...guest, phone: "+91 98765 43210" }).success).toBe(true);
  });
  it("recognises private tokens and ticket numbers typed by staff", () => {
    expect(isAccessToken("a".repeat(48))).toBe(true);
    expect(isAccessToken("A".repeat(48))).toBe(false);
    expect(isAccessToken("a".repeat(47))).toBe(false);
    expect(normaliseTicketNo(" sup-2026-000001 ")).toBe("SUP-2026-000001");
  });
  it("reads the idle-close hours from the environment, with a week as the default", () => {
    expect(idleCloseHours(undefined)).toBe(168);
    expect(idleCloseHours("48")).toBe(48);
    expect(idleCloseHours("0")).toBe(168);
    expect(idleCloseHours("abc")).toBe(168);
  });
});
