import { describe, expect, it } from "vitest";
import { SPAM_DROP, SPAM_QUARANTINE, countLinks, emailDomain, FREE_MAIL, honeypotHit, spamScore, tooFast } from "./antispam";

const base = { description: "My payment went through twice for the same course and I need a refund.", subject: "Charged twice", name: "Asha Verma", email: "asha@example.com", tooFast: false };

describe("support anti-spam", () => {
  it("scores an ordinary request at zero", () => expect(spamScore(base)).toBe(0));
  it("drops a filled honeypot or a too-fast submission", () => {
    expect(spamScore({ ...base, honeypot: "http://x.test" })).toBeGreaterThanOrEqual(SPAM_DROP);
    expect(spamScore({ ...base, tooFast: true })).toBeGreaterThanOrEqual(SPAM_DROP);
  });
  it("quarantines promotion with a link, and link-stuffed names", () => {
    const promo = spamScore({ ...base, description: "We offer digital marketing services, visit https://seo.example to boost your traffic today." });
    expect(promo).toBeGreaterThanOrEqual(SPAM_QUARANTINE);
    expect(spamScore({ ...base, name: "http://spam.example" })).toBeGreaterThanOrEqual(SPAM_DROP);
  });
  it("does not quarantine a person who pastes one link", () => {
    expect(spamScore({ ...base, description: base.description + " Receipt: https://pay.example/r/1" })).toBeLessThan(SPAM_QUARANTINE);
  });
  it("time trap: no timestamp or a fast return is a bot, a normal one is not", () => {
    const now = 1_000_000_000;
    expect(tooFast(undefined, now)).toBe(true);
    expect(tooFast("abc", now)).toBe(true);
    expect(tooFast(String(now - 1000), now)).toBe(true);
    expect(tooFast(String(now - 20_000), now)).toBe(false);
  });
  it("helpers", () => {
    expect(honeypotHit("  ")).toBe(false);
    expect(honeypotHit("x")).toBe(true);
    expect(countLinks("see www.a.com and https://b.com")).toBe(2);
    expect(emailDomain("A@Example.COM")).toBe("example.com");
    expect(FREE_MAIL.has("gmail.com")).toBe(true);
  });
});
