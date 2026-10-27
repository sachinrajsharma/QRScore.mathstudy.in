/**
 * Overseas education packages: five levels of hands-on help, from choosing universities to settling in the new country. One place for the names, prices and
 * what each level includes, so the home page, the public page, the dashboard and the shop all read the same numbers.
 *
 * All five levels are sold online at a fixed price (sku `abroad-<key>`, kind `consulting`, so a purchase alerts staff).
 */
export const ABROAD_STAGES = ["Plan", "Apply", "Prepare", "Visa and funding", "Settle in"] as const;
export type AbroadStage = (typeof ABROAD_STAGES)[number];

export interface PackageGroup { title: string; items: string[] }
export interface AbroadPackage {
  key: "discovery" | "application-pro" | "incubator" | "global-success" | "global-guardian";
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  tagline: string;
  target: string;
  /** Price in rupees, paid once. */
  from: number;
  /** Sold online at `from`. */
  online: boolean;
  /** How many of the five journey stages this level reaches. */
  reaches: 1 | 2 | 3 | 4 | 5;
  /** Name of the level this one builds on ("Everything in X, plus"). */
  builds?: string;
  accent: string;
  accent2: string;
  /** What this level adds. */
  adds: PackageGroup[];
  /** The headline items shown on the home page card. */
  headline: string[];
}

export const ABROAD_PACKAGES: AbroadPackage[] = [
  {
    key: "discovery", level: 1, name: "Discovery & Shortlisting", tagline: "Know where to apply.", target: "Students just starting out who need expert direction on where to apply.",
    from: 1999, online: true, reaches: 1, accent: "#35d9ff", accent2: "#8ff0ff",
    headline: ["Profile evaluation", "3 to 5 target universities", "Admission roadmap"],
    adds: [{ title: "What you get", items: [
      "Registration and onboarding: your dashboard profile is set up",
      "Comprehensive profile evaluation: academic history, extracurriculars and career goals",
      "Document analysis: initial vetting of transcripts, existing resumes and certificates",
      "Custom university shortlisting: a curated list of 3 to 5 target universities based on your profile and budget",
      "Basic admission roadmap: a step-by-step timeline of application deadlines and the standardized tests you need",
    ] }],
  },
  {
    key: "application-pro", level: 2, name: "Application Pro", tagline: "Apply with a stronger file.", target: "Students who know what to study and want hands-on help structuring applications to give themselves the best chance.",
    from: 5999, online: true, reaches: 2, builds: "Discovery & Shortlisting", accent: "#7857ff", accent2: "#b39dff",
    headline: ["SOP and LOR strategy", "Resume refinement", "Applications for up to 3 universities"],
    adds: [{ title: "Adds", items: [
      "SOP and LOR strategy: guidelines, templates and one round of detailed editing for Statements of Purpose and Letters of Recommendation",
      "Resume refinement: your CV formatted and optimized for international admissions",
      "Application processing: step-by-step help filling in and submitting applications for up to 3 shortlisted universities",
      "Application tracking: dashboard updates on university responses and document status",
    ] }],
  },
  {
    key: "incubator", level: 3, name: "Academic & Admission Incubator", tagline: "Admissions plus IELTS coaching.", target: "Students who want university placement and IELTS coaching in one integrated plan.",
    from: 14999, online: true, reaches: 3, builds: "Application Pro", accent: "#2fd39a", accent2: "#8cf0c9",
    headline: ["IELTS coaching", "Up to 8 applications", "Scholarship assistance"],
    adds: [{ title: "Adds", items: [
      "IELTS coaching: structured training modules, mock tests and practice resources",
      "Expanded applications: processing and submission for up to 8 universities",
      "Scholarship assistance: finding and applying for university grants, merit scholarships and financial aid",
      "University interview prep: mock interview sessions to prepare for admissions committees",
    ] }],
  },
  {
    key: "global-success", level: 4, name: "End-to-End Global Success", tagline: "From first consultation to landing abroad.", target: "Families who want complete peace of mind across the whole journey, from the first consultation to the student landing abroad.",
    from: 27999, online: true, reaches: 4, builds: "Academic & Admission Incubator", accent: "#ff8a4c", accent2: "#ffc36b",
    headline: ["1-on-1 mentorship", "Visa processing and mock visa interview", "Loan guidance and pre-departure support"],
    adds: [{ title: "Adds", items: [
      "Dedicated 1-on-1 mentorship: priority support and direct access to an admissions counsellor",
      "Visa processing and documentation: complete help with student visa applications, financial documentation and mock visa interviews",
      "Financial and loan guidance: introductions to trusted education loan providers",
      "Pre-departure support: help finalizing accommodation, travel insurance and a pre-departure briefing",
    ] }],
  },
  {
    key: "global-guardian", level: 5, name: "Global Guardian & Settlement Plan", tagline: "Support that continues after you land.", target: "Families who want ongoing support well beyond enrolment, so the student is safely settled, legally compliant and financially independent over time.",
    from: 55999, online: true, reaches: 5, builds: "End-to-End Global Success", accent: "#f2c14e", accent2: "#ffe29a",
    headline: ["Arrival and ground support", "Housing, bank and legal setup", "Quarterly welfare check-ins"],
    adds: [
      { title: "Arrival and ground support", items: ["Coordination for airport pickup on landing", "Help with immediate essentials: activating a local SIM card, understanding local public transit and getting a transit card"] },
      { title: "Residence and lease assistance", items: ["Help securing verified off-campus housing, or navigating on-campus dorm applications", "Reviewing rental agreements so the student understands local lease terms and security deposits"] },
      { title: "Administrative and legal setup (first 30 days)", items: ["Step-by-step guidance on opening a local bank account", "Help applying for the local tax or social security number needed for employment", "Registering for local healthcare and understanding how to use student medical insurance"] },
      { title: "Part-time job placement support (month 6 onward)", items: ["Localizing the resume to the host country's standard format", "A roadmap for finding on-campus jobs or legal off-campus part-time work to help cover living costs", "Basic interview coaching for retail, hospitality or campus administrative roles"] },
      { title: "Paid internship and career mapping (year 1 to year 2)", items: ["Using readiness assessments to map the skills gained in the degree to early paid internships in the field of study"] },
      { title: "Quarterly welfare check-ins", items: ["Scheduled virtual check-ins during the first academic year to monitor cultural adjustment, academic pressure and general well-being, with regular updates to the family back home"] },
    ],
  },
];

export const packageByKey = (k: string): AbroadPackage | undefined => ABROAD_PACKAGES.find((p) => p.key === k);
export const packageSku = (k: AbroadPackage["key"]): string => `abroad-${k}`;

/** Packages that are sold online, for the shop's seed list. */
export const ONLINE_PACKAGES = ABROAD_PACKAGES.filter((p) => p.online);

export const rs = (n: number): string => `₹${n.toLocaleString("en-IN")}`;
export const priceLabel = (p: AbroadPackage): string => rs(p.from);

/** Everything a level includes, from level 1 up: each earlier level's items, then this level's. */
export function cumulativeItems(p: AbroadPackage): number {
  return ABROAD_PACKAGES.filter((x) => x.level <= p.level).reduce((n, x) => n + x.adds.reduce((m, g) => m + g.items.length, 0), 0);
}

export const PACKAGE_DISCLAIMER = "GrowQR's counsellors and partners deliver these services. Admission, scholarship and visa decisions are made by universities and governments, so no package can guarantee an outcome.";

/** The comparison table: each row starts at a level and carries on up. `values` replaces the tick with text per level (for example, how many applications). */
export const MATRIX: Array<{ label: string; level: 1 | 2 | 3 | 4 | 5; values?: Partial<Record<1 | 2 | 3 | 4 | 5, string>> }> = [
  { label: "Profile evaluation and document vetting", level: 1 },
  { label: "Custom shortlist of 3 to 5 universities", level: 1 },
  { label: "Admission roadmap and deadlines", level: 1 },
  { label: "SOP and LOR strategy, with one editing round", level: 2 },
  { label: "Resume refinement for international admissions", level: 2 },
  { label: "Applications processed and submitted", level: 2, values: { 2: "Up to 3", 3: "Up to 8", 4: "Up to 8", 5: "Up to 8" } },
  { label: "Application tracking on your dashboard", level: 2 },
  { label: "IELTS coaching with mock tests", level: 3 },
  { label: "Scholarship assistance", level: 3 },
  { label: "University interview prep", level: 3 },
  { label: "Dedicated 1-on-1 mentorship", level: 4 },
  { label: "Visa processing, documentation and mock visa interview", level: 4 },
  { label: "Financial and loan guidance", level: 4 },
  { label: "Pre-departure support", level: 4 },
  { label: "Arrival and ground support", level: 5 },
  { label: "Housing and lease assistance", level: 5 },
  { label: "Bank, tax number and healthcare setup (first 30 days)", level: 5 },
  { label: "Part-time job placement support (month 6 onward)", level: 5 },
  { label: "Paid internship and career mapping (year 1 to 2)", level: 5 },
  { label: "Quarterly welfare check-ins with family updates", level: 5 },
];
