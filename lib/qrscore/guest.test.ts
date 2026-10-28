import { describe, expect, it } from "vitest";
import { isScored, scoreText } from "./index";
import { candidateId, GUEST_KEY, GUEST_TTL_MS, guessCollege, idStem, readGuest, rescore, summarize } from "./guest";

const RESUME = `Aarav Mehta
aarav.mehta.demo@example.com | +91 98765 43210 | Pune, India

SUMMARY
Final-year Computer Science student with hands-on experience in Python, SQL and data visualisation.

EDUCATION
B.Tech in Computer Science and Engineering, College of Engineering Pune, Pune, 2022 - 2026, CGPA 8.4/10

EXPERIENCE
Data Analyst Intern, Northgate Analytics, Hyderabad (Jun 2025 - Aug 2025)
- Built 6 Power BI dashboards used by 40+ stakeholders, reducing weekly reporting time by 35%
- Wrote SQL queries over 2M+ rows to find the top 3 causes of order delays
- Automated data cleaning in Python (pandas), saving 5 hours per week

PROJECTS
Customer Churn Predictor - Python, scikit-learn, pandas
- Trained a random forest model with 87% accuracy on 10,000 customer records

SKILLS
Technical: Python, SQL, Pandas, scikit-learn, Power BI, Tableau, Excel, Git
Soft: Communication, Teamwork

CERTIFICATIONS
Google Data Analytics Certificate (2024)
`;

function scan() {
  const r = scoreText(RESUME);
  if (!isScored(r)) throw new Error("sample resume was refused");
  return { r, g: summarize(r, RESUME, { name: "Aarav-Resume.txt", mime: "text/plain", size: RESUME.length }, 1_000) };
}

describe("guest scan summary", () => {
  it("keeps what the result page needs, and nothing it must not", () => {
    const { g } = scan();
    expect(g.v).toBe(1);
    expect(g.score).toBeGreaterThan(30);
    expect(g.score).toBeLessThanOrEqual(100);
    expect(g.name).toBe("Aarav Mehta");
    expect(g.email).toBe("aarav.mehta.demo@example.com");
    expect(g.college).toBe("College of Engineering Pune");
    expect(g.sections.filter((s) => s.applicable).length).toBeGreaterThanOrEqual(3);
    expect(g.sections.every((s) => s.max === 20 && s.score >= 0 && s.score <= 20)).toBe(true);
    expect(g.advice).toHaveLength(3);
    expect(g.skills).toContain("Python");
    expect(g.text.length).toBeGreaterThan(200);
  });

  it("re-scores the stored text to the very same result", () => {
    const { r, g } = scan();
    expect(rescore(g)?.overall.score).toBe(r.overall.score);
  });
});

describe("guest scan lifetime", () => {
  it("is readable for a day and gone after", () => {
    const { g } = scan();
    const data = { [GUEST_KEY]: g };
    expect(readGuest(data, 1_000 + GUEST_TTL_MS - 1)?.score).toBe(g.score);
    expect(readGuest(data, 1_000 + GUEST_TTL_MS + 1)).toBeNull();
  });
  it("ignores missing or malformed data", () => {
    expect(readGuest(null)).toBeNull();
    expect(readGuest({})).toBeNull();
    expect(readGuest({ [GUEST_KEY]: { v: 2, at: Date.now(), score: 50 } })).toBeNull();
    expect(readGuest({ [GUEST_KEY]: { v: 1, at: "yesterday", score: 50 } })).toBeNull();
  });
});

describe("college guess", () => {
  it("uses the profile's value when it looks like a name", () => {
    expect(guessCollege("Delhi Technological University", "")).toBe("Delhi Technological University");
  });
  it("rejects a year or fragment and finds the college in the text", () => {
    expect(guessCollege("2026", RESUME)).toBe("College of Engineering Pune");
    expect(guessCollege(null, "Nothing about school here")).toBeNull();
  });
});

describe("QR ID", () => {
  it("is built from the first name, capitals only, accents removed", () => {
    expect(idStem("Riya Sharma")).toBe("RIYA");
    expect(idStem("José Álvarez")).toBe("JOSE");
    expect(idStem("Venkatasubramanian Iyer")).toBe("VENKAT");
    expect(idStem("A. K. Rao")).toBe("RAO");
    expect(idStem("")).toBe("USER");
    expect(idStem("12345")).toBe("USER");
  });
  it("is GQ, the stem and four digits", () => {
    for (let i = 0; i < 50; i++) expect(candidateId("Riya Sharma")).toMatch(/^GQ-RIYA-[1-9]\d{3}$/);
    expect(candidateId("Riya", () => 0)).toBe("GQ-RIYA-1000");
    expect(candidateId("Riya", () => 0.9999)).toBe("GQ-RIYA-9999");
  });
});

describe("skills clean-up", () => {
  it("strips a leading section label and de-duplicates", async () => {
    const { cleanSkills } = await import("./guest");
    expect(cleanSkills(["Technical: Python", "SQL", "Soft Skills: Communication", "python", "Languages: Java", "Node.js"])).toEqual(["Python", "SQL", "Communication", "Java", "Node.js"]);
    expect(cleanSkills(["Time: 5pm"])).toEqual(["Time: 5pm"].map((x) => x)); // only known labels are removed
  });
});
