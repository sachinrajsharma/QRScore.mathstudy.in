/** Shared types for the Overseas Education Journey system. Pure: no database or framework imports. */

export const STATUSES = [
  "not_started", "ready_to_start", "in_progress", "submitted_for_review", "changes_requested",
  "waiting_on_student", "waiting_on_university", "blocked", "completed", "not_applicable",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not started", ready_to_start: "Ready to start", in_progress: "In progress", submitted_for_review: "Submitted for review",
  changes_requested: "Changes requested", waiting_on_student: "Waiting on student", waiting_on_university: "Waiting on university",
  blocked: "Blocked", completed: "Completed", not_applicable: "Not applicable",
};

/** Statuses that end a task: it no longer needs doing and stops counting as overdue. */
export const DONE: ReadonlySet<Status> = new Set<Status>(["completed", "not_applicable"]);

export type Role = "student" | "counselor" | "admin" | "system";
export type Priority = "low" | "normal" | "high" | "critical";
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Who is expected to do a task. `university` tasks are external: the university acts, staff record what happened. */
export type OwnerRole = "student" | "consultant" | "university";

export type EvidenceKind = "document" | "text" | "link" | "confirmation";
export interface EvidenceReq {
  kind: EvidenceKind;
  /** document: the logical document type that must be attached (see DOC_KEYS). */
  docKey?: string;
  /** document: it must be verified by staff, not merely uploaded. */
  verified?: boolean;
  /** confirmation: who must confirm. */
  by?: "student" | "consultant";
  /** Shown to the person completing the task. */
  label: string;
}
export interface EvidenceItem {
  id?: number;
  kind: EvidenceKind;
  docKey?: string;
  /** document: live status of the attached document version. */
  docStatus?: "uploaded" | "verified" | "rejected" | "expired" | "superseded";
  text?: string;
  url?: string;
  byRole: Role;
}

export const DOC_KEYS: Record<string, { label: string; restricted?: boolean; expires?: boolean }> = {
  passport: { label: "Passport", restricted: true, expires: true },
  photo: { label: "Passport-size photo" },
  transcripts: { label: "Academic transcripts / marksheets" },
  degree: { label: "Degree or provisional certificate" },
  cv: { label: "CV / resume" },
  sop: { label: "Statement of purpose" },
  lor: { label: "Letter of recommendation" },
  english_scorecard: { label: "English test scorecard", expires: true },
  english_exemption: { label: "English exemption proof (MOI / certificate)" },
  entrance_scorecard: { label: "Entrance test scorecard", expires: true },
  work_experience: { label: "Work experience letter" },
  gap_letter: { label: "Study-gap explanation" },
  portfolio: { label: "Portfolio / research proposal" },
  financial: { label: "Financial documents", restricted: true, expires: true },
  loan_sanction: { label: "Loan sanction letter", restricted: true },
  scholarship_letter: { label: "Scholarship award letter" },
  submission_proof: { label: "Proof of application submission" },
  offer_letter: { label: "Offer letter" },
  rejection_letter: { label: "Decision letter (rejection / waitlist)" },
  deposit_receipt: { label: "Deposit receipt" },
  acceptance_letter: { label: "Acceptance confirmation" },
  enrolment_doc: { label: "CAS / I-20 / CoE / admission letter for visa" },
  visa_form: { label: "Visa application form / confirmation" },
  visa_receipt: { label: "Visa fee receipt" },
  medical: { label: "Medical / TB certificate", restricted: true, expires: true },
  police: { label: "Police clearance certificate", restricted: true, expires: true },
  visa_grant: { label: "Visa / permit grant", restricted: true },
  visa_refusal: { label: "Visa refusal letter", restricted: true },
  accommodation: { label: "Accommodation confirmation" },
  insurance: { label: "Insurance policy" },
  travel: { label: "Flight / travel booking" },
  enrolment_confirmation: { label: "Enrolment confirmation" },
  other: { label: "Other document" },
};
export const isRestricted = (docKey: string): boolean => DOC_KEYS[docKey]?.restricted === true;

/** Facts about a case that decide which tasks it needs. */
export interface CaseProfile {
  destination: string; // country key: usa, uk, canada, germany, australia, france, uae
  degree: "UG" | "PG" | "PhD";
  intake: string; // free text such as "Fall 2027"
  visaRoute: string; // "student" by default; others are recorded text
  englishExempt: boolean;
  entranceTestNeeded: boolean;
  needsFunding: boolean; // funding support / loan needed
  needsLoan: boolean;
  wantsScholarship: boolean;
  needsAccommodation: boolean;
  hasWorkExperience: boolean;
  hasStudyGap: boolean;
  portfolioNeeded: boolean;
  wantsInternship: boolean;
  wantsPartTime: boolean;
}

export type Cond =
  | { all: Cond[] } | { any: Cond[] } | { not: Cond }
  | { field: keyof CaseProfile; eq?: string | boolean; in?: string[] };

export type Scope = "case" | "application";
export interface DueRule { from: "start" | "intake"; days: number }

export interface TaskDef {
  key: string;
  stage: number;
  sub: string;
  title: string;
  description: string;
  scope: Scope;
  owner: OwnerRole;
  priority: Priority;
  /** Keys of tasks this one needs first. In an application-scope task a key naming an application-scope task means "the same application's"; a case-scope task depending on an application-scope key waits for all applications ("any:key" for one). */
  deps: string[];
  evidence: EvidenceReq[];
  /** "consultant": a consultant or admin must approve before it completes. */
  review: "none" | "consultant";
  /** Plain-language completion condition shown to everyone. */
  criteria: string;
  due: DueRule;
  when?: Cond;
  /** Smallest overseas package level (1-5) that includes staff delivery. Critical tasks are never locked. */
  minLevel?: number;
  /** Student may mark "waiting on university/third party" for this task. */
  external?: boolean;
  /** Objective check that can complete the task from stored facts (see autochecks). */
  auto?: string;
  /** Short action label for the button. */
  action?: string;
}

export interface TemplateStage { no: number; name: string; blurb: string; track?: boolean }
export interface TemplateDef { key: string; name: string; stages: TemplateStage[]; tasks: TaskDef[]; recovery: Record<string, TaskDef[]>; reviewedOn: string }

/** A task as stored for a case. */
export interface TaskRow {
  id: number; caseId: number; applicationId: number | null; templateKey: string; templateVersion: number; taskKey: string;
  stage: number; sub: string; title: string; description: string; owner: OwnerRole; ownerUserId: number | null; priority: Priority; status: Status;
  dueAt: string | null; review: "none" | "consultant"; criteria: string; evidenceReq: EvidenceReq[]; minLevel: number | null; external: boolean; auto: string | null; action: string;
  blockedReason: string; naReason: string; naRequestedBy: number | null; naApprovedBy: number | null; startedAt: string | null; submittedAt: string | null; completedAt: string | null; completedBy: number | null;
  createdAt: string; updatedAt: string; obsolete: boolean; attempt: number;
}
