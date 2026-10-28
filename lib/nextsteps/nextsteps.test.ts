import { describe, expect, it } from "vitest";
import { buildNextSteps, weakest, type NextInput } from "./index";

const sections = [
  { id: 1, name: "Education & Qualifications", score: 15, max: 20, applicable: true },
  { id: 2, name: "Work Experience", score: 4, max: 20, applicable: true },
  { id: 3, name: "Skills & Competencies", score: 18, max: 20, applicable: true },
  { id: 4, name: "Projects & Portfolio", score: 9, max: 20, applicable: true },
  { id: 5, name: "Impact & Presentation", score: 0, max: 20, applicable: false },
];
const base: NextInput = { score: 62, sections, domainKey: "data", domainLabel: "data & analytics", stage: "fresher", skills: ["Python", "SQL", "Excel"], courses: [{ title: "SQL Essentials", url: "/courses/sql", reason: "Fills a gap" }] };

describe("next steps", () => {
  it("finds the weakest applicable areas first and skips areas that do not apply", () => {
    expect(weakest(sections, 2).map((s) => s.id)).toEqual([2, 4]);
  });

  it("covers every kind of service for an early-career student", () => {
    expect(buildNextSteps(base).map((g) => g.key)).toEqual(["improve", "learn", "internships", "jobs", "interview", "tests", "plans", "abroad"]);
  });

  it("leaves study abroad out for experienced people", () => {
    expect(buildNextSteps({ ...base, stage: "experienced" }).some((g) => g.key === "abroad")).toBe(false);
  });

  it("points the first group at the weakest areas", () => {
    const improve = buildNextSteps(base)[0];
    expect(improve.steps[0].title).toContain("Work Experience");
    expect(improve.steps[1].title).toContain("Projects & Portfolio");
  });

  it("recommends the courses the resume reader chose, with a fallback", () => {
    expect(buildNextSteps(base).find((g) => g.key === "learn")?.steps[0].href).toBe("/courses/sql");
    expect(buildNextSteps({ ...base, courses: [] }).find((g) => g.key === "learn")?.steps[0].href).toBe("/courses");
  });

  it("always labels job and internship listings as samples, and ranks them by skill match", () => {
    const g = buildNextSteps(base);
    for (const key of ["jobs", "internships"] as const) {
      const steps = g.find((x) => x.key === key)!.steps;
      expect(steps.length).toBe(3);
      expect(steps.every((s) => s.sample === true)).toBe(true);
    }
    expect(g.find((x) => x.key === "jobs")!.steps[0].title).toContain("Data Analyst");
    const noOverlap = buildNextSteps({ ...base, skills: [] }).find((x) => x.key === "jobs")!.steps;
    expect(noOverlap.length).toBe(3);
  });

  it("suggests a plan that fits the score", () => {
    const plan = (score: number) => buildNextSteps({ ...base, score }).find((g) => g.key === "plans")!.steps[0].title;
    expect(plan(40)).toBe("Pro plan");
    expect(plan(65)).toBe("Silver plan");
    expect(plan(90)).toBe("Gold plan");
  });
});
