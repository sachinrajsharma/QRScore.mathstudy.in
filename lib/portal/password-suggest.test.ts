import { describe, expect, it } from "vitest";
import { suggestPassword } from "./password-suggest";
import { weakPassword } from "./password";

describe("suggested password", () => {
  it("is three words, a number and a symbol", () => {
    for (let i = 0; i < 200; i++) expect(suggestPassword()).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-[A-Z][a-z]+-[1-9]\d[!@#$%&*?]$/);
  });
  it("is different every time and passes the site's own password rules", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = suggestPassword();
      seen.add(p);
      expect(weakPassword(p, "someone@example.com", "Someone Else")).toBeNull();
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});
