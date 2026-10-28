import "server-only";
import { adviceFromResult, isScored, scoreText, type ScoredResult } from "./index";
import type { AdviceItem } from "./advice";

/**
 * A resume scanned by someone who has not signed up yet. The result is kept in their anonymous session for a day (and only until they close the loop by
 * creating an account), so the sign-up that follows can save it without asking them to upload again. Nothing here uses AI: the score is the same
 * deterministic RQ engine the Skill Passport uses.
 */
export const GUEST_KEY = "guest_scan";
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 120_000;

export interface GuestSection { id: number; name: string; score: number; max: number; applicable: boolean }
export interface GuestCourse { title: string; url: string; reason: string }
export interface GuestScan {
  v: 1;
  at: number;
  fileName: string | null;
  fileMime: string;
  fileSize: number;
  text: string;
  name: string | null;
  email: string | null;
  college: string | null;
  score: number;
  grade: string;
  domain: { key: string; label: string };
  stage: string;
  skills: string[];
  sections: GuestSection[];
  advice: AdviceItem[];
  courses: GuestCourse[];
}

/**
 * The skills list as the resume reader returns it can start with the section label ("Technical: Python"). Strip a leading label so the skill matches by name.
 */
export function cleanSkills(list: string[], max = 30): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.replace(/^\s*(technical|soft|core|key|hard|programming|professional|other)?\s*(skills?|languages?|tools?|competenc(?:y|ies))?\s*:\s*/i, "").trim();
    if (v && v.length <= 60 && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out.slice(0, max);
}

const title = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * The college named on the resume. The profile reader sometimes returns a year or a fragment, so a value is used only if it looks like a name; otherwise the
 * resume's lines are searched for one that names a college, university or institute.
 */
export function guessCollege(institution: string | null | undefined, text: string): string | null {
  const ok = (v: string): boolean => (v.match(/\p{L}/gu) ?? []).length >= 6 && !/^\d/.test(v.trim());
  if (institution && ok(institution)) return title(institution);
  const KEY = /\b(college|university|institute|institution|school of|polytechnic|iit|nit|iiit)\b/i;
  for (const raw of text.split("\n").slice(0, 400)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!KEY.test(line) || line.length > 160) continue;
    const parts = line.split(/[,|–—-]\s*/).map((p) => p.trim()).filter(Boolean);
    const hit = parts.find((p) => KEY.test(p) && ok(p));
    if (hit) return title(hit);
  }
  return null;
}

export function sectionsOf(result: ScoredResult): GuestSection[] {
  return result.sections
    .filter((s) => s.implemented !== false)
    .map((s) => ({ id: s.id, name: s.name, score: Math.round((s.section_score ?? 0) * 10) / 10, max: s.points_per_section ?? 20, applicable: s.applicable !== false }));
}

export function coursesOf(result: ScoredResult): GuestCourse[] {
  const recs = (result.sections.find((s) => s.id === 1)?.recommendations ?? []) as Array<{ title?: string; url?: string; reason?: string }>;
  return recs.filter((r) => r.title && r.url).slice(0, 4).map((r) => ({ title: String(r.title), url: String(r.url), reason: String(r.reason ?? "") }));
}

/** Boil a scored resume down to what the visitor's result page needs. */
export function summarize(result: ScoredResult, text: string, file: { name: string | null; mime: string; size: number }, now = Date.now()): GuestScan {
  return {
    v: 1,
    at: now,
    fileName: file.name,
    fileMime: file.mime,
    fileSize: file.size,
    text: text.slice(0, MAX_TEXT),
    name: result.profile.personal.name ? title(result.profile.personal.name) : null,
    email: result.profile.personal.email ? title(result.profile.personal.email).toLowerCase() : null,
    college: guessCollege(result.profile.education.find((e) => e.institution)?.institution, text),
    score: Math.round(result.overall.score * 10) / 10,
    grade: result.grade,
    domain: { key: result.domain.key, label: result.domain.label },
    stage: result.career.stage,
    skills: cleanSkills([...(result.profile.skills.technical ?? []), ...(result.profile.skills.soft ?? [])]),
    sections: sectionsOf(result),
    advice: adviceFromResult(result, 3),
    courses: coursesOf(result),
  };
}

/** The guest scan in a session's data, if it is there and still within its day. */
export function readGuest(data: Record<string, unknown> | undefined | null, now = Date.now()): GuestScan | null {
  const g = data?.[GUEST_KEY] as GuestScan | undefined;
  if (!g || g.v !== 1 || typeof g.at !== "number" || typeof g.score !== "number") return null;
  return now - g.at > GUEST_TTL_MS ? null : g;
}

/** Re-score the stored text. The result is deterministic, so this equals the first scan and lets the full result be saved without keeping it in the session. */
export function rescore(g: GuestScan): ScoredResult | null {
  const r = scoreText(g.text);
  return isScored(r) ? r : null;
}

// ---- QR ID ---------------------------------------------------------------------------------------------------------

/** The readable part of an ID from someone's name: their first name in capitals, at most 6 letters, with accents removed ("José" gives JOSE). */
export function idStem(name: string): string {
  const first = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z]+/).find((w) => w.length >= 2) ?? "";
  return (first || "USER").slice(0, 6);
}

/** GQ-RIYA-4821: the stem plus four random digits. The caller checks the database for a clash and tries again. */
export function candidateId(name: string, rnd: () => number = Math.random): string {
  const n = Math.floor(rnd() * 9000) + 1000;
  return `GQ-${idStem(name)}-${n}`;
}
