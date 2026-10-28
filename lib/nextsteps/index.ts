import { INTERNSHIPS } from "@/components/home-options/data";
import { SAMPLE_JOBS } from "./sample-jobs";

/**
 * "What to do next": every GrowQR service that could raise a student's QR Score or move their career on, ordered by what their own resume needs.
 * Deterministic rules over the score, the weakest areas, the career stage and the skills found on the resume. Nothing here is AI and nothing is made
 * up except the clearly labelled SAMPLE job and internship listings.
 */
export interface NextInput {
  score: number;
  /** The five areas with their score out of `max`. */
  sections: Array<{ id: number; name: string; score: number; max: number; applicable: boolean }>;
  domainKey: string;
  domainLabel: string;
  stage: string; // student | fresher | experienced | senior
  skills: string[];
  courses: Array<{ title: string; url: string; reason: string }>;
}

export type GroupKey = "improve" | "learn" | "internships" | "jobs" | "interview" | "tests" | "plans" | "abroad";
export interface Step { title: string; why: string; href: string; cta: string; tag?: string; sample?: boolean }
export interface Group { key: GroupKey; title: string; blurb: string; steps: Step[] }

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
const overlap = (a: string[], b: string[]): string[] => { const mine = new Set(a.map(norm)); return b.filter((x) => mine.has(norm(x))); };

/** The weakest applicable areas, worst first. */
export function weakest(sections: NextInput["sections"], n = 2): NextInput["sections"] {
  return sections.filter((s) => s.applicable && s.max > 0).sort((a, b) => a.score / a.max - b.score / b.max).slice(0, n);
}

export function buildNextSteps(i: NextInput): Group[] {
  const weak = weakest(i.sections, 2);
  const early = i.stage === "student" || i.stage === "fresher";
  const groups: Group[] = [];

  // 1. raise the score itself
  groups.push({
    key: "improve", title: "Raise your QR Score", blurb: "The fastest gains are in your weakest areas.",
    steps: [
      ...weak.map((w) => ({ title: `Strengthen: ${w.name}`, why: `You scored ${Math.round(w.score)} of ${w.max} here, your lowest area.`, href: "/studio", cta: "Improve in Resume Studio" })),
      { title: "Rescore after every edit", why: "Edit in Resume Studio, upload the new version and watch your score move.", href: "/passport", cta: "Score a new version" },
    ],
  });

  // 2. learn
  const courses = i.courses.slice(0, 3).map((c) => ({ title: c.title, why: c.reason || `Recommended for ${i.domainLabel} resumes.`, href: c.url, cta: "See the course" }));
  groups.push({ key: "learn", title: "Learn", blurb: `Courses picked from what your resume shows (${i.domainLabel}).`, steps: courses.length ? courses : [{ title: "Browse all courses", why: "Self-paced courses with certificates.", href: "/courses", cta: "Browse courses" }] });

  // 3. internships (sample listings, ranked by skill overlap)
  const interns = INTERNSHIPS.map((x) => ({ x, hit: overlap(i.skills, x.skills) })).sort((a, b) => b.hit.length - a.hit.length).slice(0, 3);
  groups.push({
    key: "internships", title: "Internships", blurb: "Sample listings, matched on the skills found in your resume.",
    steps: interns.map(({ x, hit }) => ({
      title: `${x.title} · ${x.company}`, why: hit.length ? `Matches your skills: ${hit.slice(0, 3).join(", ")}.` : `Builds ${x.skills.slice(0, 3).join(", ")}.`,
      href: "/internships", cta: "Open internships", tag: `${x.remote ? "Remote" : x.place} · ₹${x.stipend.toLocaleString("en-IN")}/month`, sample: true,
    })),
  });

  // 4. jobs (sample listings)
  const jobs = SAMPLE_JOBS.map((j) => ({ j, hit: overlap(i.skills, j.skills), dom: j.domains.includes(i.domainKey) ? 1 : 0 }))
    .sort((a, b) => (b.hit.length + b.dom * 2) - (a.hit.length + a.dom * 2)).slice(0, 3);
  groups.push({
    key: "jobs", title: "Jobs", blurb: "Sample listings so you can see how job matches will look.",
    steps: jobs.map(({ j, hit }) => ({
      title: `${j.title} · ${j.company}`, why: hit.length ? `You already have ${hit.slice(0, 3).join(", ")}.` : `A common next role in ${i.domainLabel}.`,
      href: "/internships", cta: "Explore roles", tag: `${j.place} · ${j.pay}`, sample: true,
    })),
  });

  // 5. interview skills
  groups.push({
    key: "interview", title: "Interview skills", blurb: "Practise before it counts.",
    steps: [
      { title: "AI mock interview", why: early ? "Your first interviews are the hardest. Practise common questions and get feedback." : "Rehearse role-specific questions and sharpen your answers.", href: "/ai-interviewer", cta: "Start a mock interview" },
      { title: "English writing and speaking practice", why: "Clear writing lifts your resume and your applications.", href: "/writing-clinic", cta: "Try the Writing Studio" },
    ],
  });

  // 6. online tests
  groups.push({
    key: "tests", title: "Online tests", blurb: "Measure yourself against real exam formats.",
    steps: [
      { title: "Practice tests", why: "Timed tests with instant scoring and review.", href: "/practice-tests", cta: "Take a practice test" },
      { title: "Exam preparation", why: "JEE, NEET, UPSC, SSC, IELTS and more, with mock tests.", href: "/exam-prep", cta: "See exam prep" },
    ],
  });

  // 7. plans
  const plan = i.score < 55 ? "Pro" : i.score < 75 ? "Silver" : "Gold";
  groups.push({
    key: "plans", title: "Plans and packages", blurb: "Get more courses, practice and expert help in one subscription.",
    steps: [{ title: `${plan} plan`, why: i.score < 55 ? "A course included each month is the quickest way to lift a score below 55." : "More included courses and expert help to keep climbing.", href: "/pricing", cta: "Compare plans" }],
  });

  // 8. study abroad, for students and freshers
  if (early) {
    groups.push({
      key: "abroad", title: "Study abroad", blurb: "Thinking of a Master's overseas?",
      steps: [
        { title: "Explore universities", why: "Match your profile to Safe, Target and Reach universities.", href: "/study-abroad", cta: "Explore universities" },
        { title: "Overseas education packages", why: "Expert help from your shortlist to your first month abroad, from ₹1,999.", href: "/overseas-packages", cta: "See the packages" },
      ],
    });
  }
  return groups;
}
