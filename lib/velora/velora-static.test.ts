import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "../../public/velora-static");
const pages = ["home", "hire", "tech", "global", "learn"];
const divisions = ["hire", "tech", "global", "learn"];

describe("VELORA static pages are phone and tablet ready", () => {
  for (const name of pages) {
    const html = readFileSync(path.join(dir, `${name}.html`), "utf8");

    it(`${name}: viewport covers the notch and the touch stylesheet is present`, () => {
      expect(html).toMatch(/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
      expect(html).toContain('id="vl-touch"');
      expect(html).toContain("env(safe-area-inset-top)");
      expect(html).toContain("min-height: 44px");
    });
  }

  for (const name of divisions) {
    const html = readFileSync(path.join(dir, `${name}.html`), "utf8");

    it(`${name}: keeps the division menu below 1280px and links to every division`, () => {
      expect(html).toContain("@media (min-width: 1280px) { .dv-menu { display: none; } }");
      const panel = html.match(/<div class="dv-menu-panel">([\s\S]*?)<\/div><\/details>/)?.[1] ?? "";
      for (const d of divisions) expect(panel).toContain(`href="/velora/${d}"`);
    });
  }
});
