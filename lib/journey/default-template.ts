import { DOC_KEYS, type Cond, type EvidenceReq, type OwnerRole, type Priority, type TaskDef, type TemplateDef, type TemplateStage } from "./types";

/**
 * The built-in workflow template: 12 core stages plus two opt-in tracks (internships abroad, part-time jobs abroad).
 * Personalisation is by `when` conditions on the case profile (destination, degree, tests, funding, accommodation ...).
 * Destination rules reflect common requirements and were reviewed on REVIEWED_ON; rules change often, so the visa tasks tell the student to confirm
 * against the official government source and nothing here promises an outcome.
 */
export const REVIEWED_ON = "2026-10-27";

export const STAGES: TemplateStage[] = [
  { no: 1, name: "Profile & Counselling", blurb: "Your profile, goals and a first counselling plan." },
  { no: 2, name: "Eligibility & Academic Assessment", blurb: "What you are eligible for, and what is missing." },
  { no: 3, name: "University & Course Shortlisting", blurb: "A balanced list of ambitious, target and safer options you approve." },
  { no: 4, name: "Document Collection & Verification", blurb: "Every document collected, checked and kept current." },
  { no: 5, name: "Exams & Application Preparation", blurb: "Tests, SOP, recommendations and a readiness check." },
  { no: 6, name: "Application Submission", blurb: "One application per university, course and intake, with proof." },
  { no: 7, name: "Follow-up & Interviews", blurb: "Track every university and prepare for interviews." },
  { no: 8, name: "Offers, Decisions & Acceptance", blurb: "Record offers, compare them and decide formally." },
  { no: 9, name: "Finance, Funding & Accommodation", blurb: "A funded plan and a place to live." },
  { no: 10, name: "Visa & Immigration", blurb: "A route-specific visa checklist. Decisions rest with the authorities." },
  { no: 11, name: "Pre-Departure & Travel", blurb: "Travel, insurance and a landing plan." },
  { no: 12, name: "Arrival, Enrolment & Alumni", blurb: "Arrive, enrol and settle in, with after-arrival support." },
  { no: 13, name: "Internships Abroad", blurb: "Optional track: work-rights-aware internship search.", track: true },
  { no: 14, name: "Part-time Jobs Abroad", blurb: "Optional track: legal part-time work within your visa limits.", track: true },
];

/** Default due date per stage: [from, days]. Early stages count from the case start; later ones count back from the intake. */
const STAGE_DUE: Record<number, [("start" | "intake"), number]> = {
  1: ["start", 7], 2: ["start", 21], 3: ["start", 35], 4: ["intake", -210], 5: ["intake", -180], 6: ["intake", -150], 7: ["intake", -120],
  8: ["intake", -90], 9: ["intake", -75], 10: ["intake", -60], 11: ["intake", -21], 12: ["intake", 14], 13: ["intake", 120], 14: ["intake", 60],
};

interface Opt {
  sub: string; d?: string; o?: OwnerRole; p?: Priority; dep?: string[]; ev: string[]; r?: boolean; c?: string; t?: number; w?: Cond; min?: number; ext?: boolean; auto?: string; a?: string; app?: boolean;
}

function parseEv(spec: string): EvidenceReq {
  const [kind, x, ...rest] = spec.split(":");
  if (kind === "doc") { const verified = x.endsWith("!"); const k = x.replace("!", ""); return { kind: "document", docKey: k, verified, label: `${DOC_KEYS[k]?.label ?? k}${verified ? " (verified by staff)" : ""}` }; }
  if (kind === "conf") return { kind: "confirmation", by: x as "student" | "consultant", label: rest.join(":") || "Confirmation note" };
  if (kind === "link") return { kind: "link", label: x };
  return { kind: "text", label: [x, ...rest].join(":") };
}

const tasks: TaskDef[] = [];
let ord = 0;
function T(stage: number, key: string, title: string, o: Opt): void {
  const [from, days] = STAGE_DUE[stage];
  ord += 1;
  const owner = o.o ?? "student";
  tasks.push({
    key, stage, sub: o.sub, title, description: o.d ?? title, scope: o.app ? "application" : "case", owner, priority: o.p ?? "normal", deps: o.dep ?? [],
    evidence: o.ev.map(parseEv), review: o.r ? "consultant" : "none", criteria: o.c ?? `Done when: ${o.ev.map((e) => parseEv(e).label).join(", ")}.`,
    due: { from, days: days + (o.t ?? 0) + Math.floor(ord / 12) }, when: o.w, minLevel: o.min, external: o.ext, auto: o.auto, action: o.a,
  });
}

const dest = (...d: string[]): Cond => ({ field: "destination", in: d });
const deg = (...d: string[]): Cond => ({ field: "degree", in: d });
const flag = (field: keyof import("./types").CaseProfile, v = true): Cond => ({ field, eq: v });
const and = (...c: Cond[]): Cond => ({ all: c });

// ---- 1. Profile & Counselling --------------------------------------------------------------------------------------------
T(1, "s1.email_verified", "Confirm your email address", { sub: "Account", ev: ["conf:student:Date you confirmed your email"], auto: "email_verified", p: "high", a: "Confirm email", c: "Done when your email address is confirmed (checked automatically)." });
T(1, "s1.profile_form", "Complete your study-abroad profile", { sub: "Profile", dep: ["s1.email_verified"], ev: ["conf:student:Profile completed with consent"], auto: "profile_complete", p: "high", a: "Build profile", c: "Done when academics, English test, budget, countries, intake and consent are saved (checked automatically)." });
T(1, "s1.goals", "Write down your goals and constraints", { sub: "Profile", dep: ["s1.profile_form"], ev: ["text:Your goals, budget limits and must-haves"], t: 1, a: "Add goals" });
T(1, "s1.call_booked", "Book your first counselling call", { sub: "Counselling", dep: ["s1.profile_form"], ev: ["text:Date and time of the booked call"], p: "high", a: "Book the call", t: 1 });
T(1, "s1.call_held", "First counselling call held", { sub: "Counselling", o: "consultant", dep: ["s1.call_booked"], ev: ["conf:consultant:Call date and summary"], p: "high", t: 2 });
T(1, "s1.notes_recorded", "Counselling notes and goals recorded", { sub: "Counselling", o: "consultant", dep: ["s1.call_held"], ev: ["text:Notes: goals, constraints, concerns"], t: 2 });
T(1, "s1.budget", "Confirm your budget and who is paying", { sub: "Profile", dep: ["s1.profile_form"], ev: ["text:Total budget and funding source (family / savings / loan / scholarship)"], t: 2, a: "Confirm budget" });
T(1, "s1.countries", "Confirm your destination country (or countries)", { sub: "Profile", dep: ["s1.call_held"], ev: ["text:Chosen destination(s) and why"], p: "high", t: 3, a: "Confirm destination" });
T(1, "s1.package", "Confirm your service package and what it covers", { sub: "Counselling", o: "consultant", dep: ["s1.call_held"], ev: ["conf:consultant:Package and scope explained to the student"], t: 3 });
T(1, "s1.roadmap", "Personalised roadmap shared with you", { sub: "Counselling", o: "consultant", dep: ["s1.countries", "s1.package", "s1.notes_recorded"], ev: ["conf:consultant:Roadmap shared (date and where)"], p: "high", t: 4 });

// ---- 2. Eligibility & Academic Assessment --------------------------------------------------------------------------------------
T(2, "s2.transcripts", "Upload your academic transcripts", { sub: "Academics", dep: ["s1.profile_form"], ev: ["doc:transcripts"], r: true, p: "high", a: "Upload transcripts" });
T(2, "s2.backlogs", "Declare backlogs, failed subjects and gaps honestly", { sub: "Academics", dep: ["s1.profile_form"], ev: ["text:Backlogs / gaps, or 'none' with dates"], a: "Declare", t: 1 });
T(2, "s2.work_exp", "Record your work experience", { sub: "Academics", dep: ["s1.profile_form"], ev: ["text:Employers, roles and dates"], w: flag("hasWorkExperience"), a: "Add experience", t: 1 });
T(2, "s2.gap_letter", "Explain your study gap", { sub: "Academics", dep: ["s2.backlogs"], ev: ["doc:gap_letter"], r: true, w: flag("hasStudyGap"), a: "Upload explanation", t: 2 });
T(2, "s2.grade_conversion", "Grades converted to the destination's scale", { sub: "Assessment", o: "consultant", dep: ["s2.transcripts"], ev: ["text:Converted grade and the method used"], t: 3 });
T(2, "s2.english_req", "English-test requirement identified for your target programmes", { sub: "Assessment", o: "consultant", dep: ["s1.countries"], ev: ["text:Test, minimum scores, or exemption rule"], w: flag("englishExempt", false), t: 3 });
T(2, "s2.english_exempt", "Upload your English-exemption proof", { sub: "Assessment", dep: ["s1.countries"], ev: ["doc:english_exemption"], r: true, w: flag("englishExempt"), a: "Upload proof", t: 3 });
T(2, "s2.entrance_req", "Entrance-test requirement identified (GRE / GMAT / SAT)", { sub: "Assessment", o: "consultant", dep: ["s1.countries"], ev: ["text:Tests required per programme, or 'none required'"], w: flag("entranceTestNeeded"), t: 3 });
T(2, "s2.eligibility_report", "Eligibility assessment report prepared", { sub: "Assessment", o: "consultant", dep: ["s2.grade_conversion", "s2.backlogs"], ev: ["text:Findings: eligible options, gaps and risks"], p: "high", t: 5 });
T(2, "s2.ack", "Review and acknowledge your eligibility report", { sub: "Assessment", dep: ["s2.eligibility_report"], ev: ["conf:student:What you understood and any questions"], a: "Acknowledge", t: 6 });

// ---- 3. University & Course Shortlisting --------------------------------------------------------------------------------------
T(3, "s3.country_compare", "Review the country comparison (cost, work rights, visa)", { sub: "Research", dep: ["s2.ack"], ev: ["conf:student:Key takeaways"], a: "Review", t: 0 });
T(3, "s3.longlist", "Longlist of at least 8 programmes built", { sub: "Research", o: "consultant", dep: ["s2.eligibility_report"], ev: ["text:Longlist with fit notes"], t: 1 });
T(3, "s3.mix", "Shortlist has ambitious, target and safer options", { sub: "Shortlist", o: "consultant", dep: ["s3.longlist"], ev: ["conf:consultant:Mix confirmed (ambitious / target / safer)"], auto: "shortlist_mix", p: "high", t: 3, c: "Done when at least one ambitious, one target and one safer university are on the shortlist (checked automatically)." });
T(3, "s3.fees_scholar", "Fees and scholarship options reviewed per university", { sub: "Shortlist", o: "consultant", dep: ["s3.mix"], ev: ["text:Fees, scholarships and deadlines per university"], t: 4 });
T(3, "s3.comparison", "Comparison report shared with you", { sub: "Shortlist", o: "consultant", dep: ["s3.fees_scholar"], ev: ["link:Link to the comparison report", "conf:consultant:Report shared (date)"], p: "high", t: 5 });
T(3, "s3.fit_check", "Check each programme fits your goals", { sub: "Shortlist", dep: ["s3.comparison"], ev: ["text:Notes on fit for each shortlisted programme"], t: 6, a: "Add notes" });
T(3, "s3a.approve", "Approve this university and programme", { sub: "Per university", app: true, dep: ["s3.comparison"], ev: ["conf:student:I approve applying here (type the date)"], p: "high", t: 6, a: "Approve this university", c: "Done when you approve this university and programme in writing. Nothing is applied for without your approval." });
T(3, "s3.approve", "Approve your final shortlist", { sub: "Decision", dep: ["s3.fit_check", "s3.comparison", "s3a.approve"], ev: ["conf:student:I approve this shortlist (type the date)"], p: "high", t: 7, a: "Approve shortlist", c: "Done when you have approved the final shortlist in writing. Nothing is applied for before this." });
T(3, "s3.deadlines", "Application deadlines mapped for every university", { sub: "Decision", o: "consultant", dep: ["s3.approve"], ev: ["text:Deadline per university and intake"], p: "high", t: 8 });

// ---- 4. Document Collection & Verification -----------------------------------------------------------------------------------
const D4 = "Document collection";
T(4, "s4.passport", "Passport scanned and uploaded", { sub: D4, dep: ["s1.profile_form"], ev: ["doc:passport!"], r: true, p: "critical", a: "Upload passport", d: "Colour scan of the photo page. Must be valid for at least 6 months beyond the end of your course." });
T(4, "s4.passport_validity", "Passport validity checked against your course dates", { sub: D4, o: "consultant", dep: ["s4.passport"], ev: ["text:Expiry date and the date it must be valid until"], p: "critical" });
T(4, "s4.photo", "Passport-size photo", { sub: D4, ev: ["doc:photo"], r: true });
T(4, "s4.marks_10", "Class 10 marksheet", { sub: D4, ev: ["doc:transcripts"], r: true, w: deg("UG", "PG", "PhD") });
T(4, "s4.degree", "Degree certificate or provisional certificate", { sub: D4, ev: ["doc:degree!"], r: true, w: deg("PG", "PhD"), p: "high" });
T(4, "s4.cv", "Updated CV / resume", { sub: D4, ev: ["doc:cv"], r: true });
T(4, "s4.work_letters", "Work-experience letters", { sub: D4, ev: ["doc:work_experience"], r: true, w: flag("hasWorkExperience") });
T(4, "s4.moi", "Medium-of-instruction certificate", { sub: D4, ev: ["doc:english_exemption"], r: true, w: flag("englishExempt") });
T(4, "s4.translations", "Certified translations of documents", { sub: D4, ev: ["doc:other"], r: true, w: dest("germany", "france"), d: "Official documents in a language other than the language of study often need certified translation or authentication. Your consultant will tell you which." });
T(4, "s4.attestation", "Document attestation / apostille (where required)", { sub: D4, ev: ["doc:other"], r: true, w: dest("germany", "france", "uae"), d: "Needed for some countries. Confirm with the embassy before paying anyone." });
T(4, "s4.expiry_review", "Document expiry review", { sub: "Verification", o: "consultant", dep: ["s4.passport"], ev: ["text:Documents expiring before the intake, or 'none'"], t: 8 });
T(4, "s4.verified_core", "All core documents verified by staff", { sub: "Verification", o: "consultant", dep: ["s4.passport", "s4.photo", "s4.cv", "s2.transcripts"], ev: ["conf:consultant:Checked each document (names, dates, legibility)"], p: "high", t: 10, auto: "core_docs_verified", c: "Done when the passport, transcripts and CV are verified by staff (checked automatically)." });
T(4, "s4.reject_fix", "Fix any rejected document", { sub: "Verification", dep: ["s4.verified_core"], ev: ["text:What you re-uploaded, or 'nothing was rejected'"], t: 11, a: "Review feedback" });
T(4, "s4a.checklist", "University-specific document checklist", { sub: "Per university", o: "consultant", app: true, dep: ["s3a.approve"], ev: ["text:Checklist for this university and programme"], t: 4 });
T(4, "s4a.extra_docs", "Upload this university's extra documents", { sub: "Per university", app: true, dep: ["s4a.checklist"], ev: ["doc:other"], r: true, t: 6, a: "Upload documents" });
T(4, "s4a.docs_complete", "This university's file is complete", { sub: "Per university", o: "consultant", app: true, dep: ["s4a.extra_docs", "s4.verified_core"], ev: ["conf:consultant:Everything on the checklist is present and verified"], p: "high", t: 12 });

// ---- 5. Exams & Application Preparation --------------------------------------------------------------------------------------
const NEEDS_ENG = flag("englishExempt", false);
T(5, "s5.english_book", "Book your English test", { sub: "Tests", dep: ["s2.english_req"], ev: ["text:Test, date and booking reference"], w: NEEDS_ENG, p: "high", t: -30, a: "Record booking" });
T(5, "s5.english_prep", "English test preparation plan followed", { sub: "Tests", dep: ["s5.english_book"], ev: ["text:Practice test score and date"], w: NEEDS_ENG, t: -20, a: "Log practice" });
T(5, "s5.english_taken", "English test taken and scorecard uploaded", { sub: "Tests", dep: ["s5.english_book"], ev: ["doc:english_scorecard!"], r: true, w: NEEDS_ENG, p: "critical", t: -10, a: "Upload scorecard" });
T(5, "s5.english_meets", "English score checked against each university's minimum", { sub: "Tests", o: "consultant", dep: ["s5.english_taken"], ev: ["text:Score vs required minimum per university"], w: NEEDS_ENG, p: "high", t: -5 });
T(5, "s5.entrance_book", "Book your entrance test (GRE / GMAT / SAT)", { sub: "Tests", dep: ["s2.entrance_req"], ev: ["text:Test, date and booking reference"], w: flag("entranceTestNeeded"), p: "high", t: -40, a: "Record booking" });
T(5, "s5.entrance_taken", "Entrance test taken and scorecard uploaded", { sub: "Tests", dep: ["s5.entrance_book"], ev: ["doc:entrance_scorecard!"], r: true, w: flag("entranceTestNeeded"), p: "critical", t: -15, a: "Upload scorecard" });
T(5, "s5.sop_brief", "SOP brief: your story, goals and why each course", { sub: "Statement of purpose", dep: ["s3.approve"], ev: ["text:Outline of your SOP"], a: "Write the brief", t: -30 });
T(5, "s5.sop_draft", "SOP first draft uploaded", { sub: "Statement of purpose", dep: ["s5.sop_brief"], ev: ["doc:sop"], r: true, a: "Upload draft", t: -20, min: 2 });
T(5, "s5.sop_final", "SOP final version approved", { sub: "Statement of purpose", dep: ["s5.sop_draft"], ev: ["doc:sop!"], r: true, p: "high", a: "Upload final SOP", t: -5 });
T(5, "s5.lor_people", "Choose at least two recommenders", { sub: "Recommendations", dep: ["s3.approve"], ev: ["text:Names, roles and relationship of your recommenders"], a: "Add recommenders", t: -30 });
T(5, "s5.lor_sent", "Recommendation requests sent", { sub: "Recommendations", dep: ["s5.lor_people"], ev: ["conf:student:Who you asked and on which date"], a: "Record requests", t: -25 });
T(5, "s5.lor_received", "Recommendation letters received", { sub: "Recommendations", dep: ["s5.lor_sent"], ev: ["doc:lor"], r: true, ext: true, p: "high", a: "Upload letters", t: -10 });
T(5, "s5.cv_final", "Final CV tailored for admissions", { sub: "Profile materials", dep: ["s4.cv"], ev: ["doc:cv!"], r: true, a: "Upload final CV", t: -10, min: 2 });
T(5, "s5.portfolio", "Portfolio or research proposal ready", { sub: "Profile materials", dep: ["s3.approve"], ev: ["doc:portfolio"], r: true, w: or(flag("portfolioNeeded"), deg("PhD")), a: "Upload", t: -15 });
T(5, "s5.readiness", "Application readiness check passed", { sub: "Readiness", o: "consultant", dep: ["s5.sop_final", "s5.lor_received", "s4.verified_core"], ev: ["conf:consultant:Readiness checklist reviewed; list anything still open"], p: "critical", t: 0, c: "Done when a consultant confirms the file is ready: documents verified, SOP approved, recommendations in, tests scored." });
T(5, "s5a.form", "Application form filled in for this university", { sub: "Per university", app: true, dep: ["s5.readiness", "s4a.docs_complete"], ev: ["conf:consultant:Form filled; portal reference"], t: 6 });
T(5, "s5a.fee", "Application fee paid (receipt)", { sub: "Per university", app: true, dep: ["s5a.form"], ev: ["doc:other"], r: true, p: "high", t: 8, a: "Upload receipt" });
function or(...c: Cond[]): Cond { return { any: c }; }

// ---- 6. Application Submission --------------------------------------------------------------------------------------------------
T(6, "s6a.final_review", "Final review of this application", { sub: "Submission", o: "consultant", app: true, dep: ["s5a.fee"], ev: ["conf:consultant:Reviewed the full file for this university"], p: "high" });
T(6, "s6a.signoff", "Sign off this application before it is sent", { sub: "Submission", app: true, dep: ["s6a.final_review"], ev: ["conf:student:I have checked my details and approve sending"], p: "high", a: "Approve to send", t: 3 });
T(6, "s6a.submit", "Application submitted to the university", { sub: "Submission", o: "consultant", app: true, dep: ["s6a.signoff"], ev: ["doc:submission_proof!"], p: "critical", t: 5, c: "Done only when proof of submission (confirmation page or email) is attached and verified. One submission per university, programme and intake." });
T(6, "s6a.confirmation", "University acknowledgement received", { sub: "Submission", o: "university", app: true, dep: ["s6a.submit"], ev: ["text:Acknowledgement reference or email date"], ext: true, t: 10 });
T(6, "s6a.portal_login", "University portal login saved safely", { sub: "Submission", app: true, dep: ["s6a.submit"], ev: ["conf:student:Login created and stored in your own password manager"], t: 8, a: "Confirm" });
T(6, "s6.all_sent", "All approved applications submitted", { sub: "Submission", o: "consultant", dep: ["s5.readiness", "s6a.submit"], ev: ["conf:consultant:Number submitted vs approved shortlist"], t: 12 });

// ---- 7. Follow-up & Interviews ------------------------------------------------------------------------------------------------
T(7, "s7a.status_check", "Application status checked with the university", { sub: "Follow-up", o: "consultant", app: true, dep: ["s6a.confirmation"], ev: ["text:What the university said and the date"], t: 0 });
T(7, "s7a.extra_requested", "Respond to any extra document request", { sub: "Follow-up", app: true, dep: ["s6a.confirmation"], ev: ["text:What was asked and what you sent, or 'no request'"], t: 4, a: "Respond" });
T(7, "s7a.interview_invite", "Interview invitation received (if the university interviews)", { sub: "Interview", o: "university", app: true, dep: ["s6a.confirmation"], ev: ["text:Date and format, or 'no interview required'"], ext: true, t: 8 });
T(7, "s7a.interview_prep", "Interview preparation done", { sub: "Interview", app: true, dep: ["s7a.interview_invite"], ev: ["text:Mock interview feedback or practice notes"], min: 3, t: 10, a: "Log preparation" });
T(7, "s7a.interview_done", "Interview attended", { sub: "Interview", app: true, dep: ["s7a.interview_prep"], ev: ["conf:student:Date, interviewer and how it went"], t: 12, a: "Record interview" });
T(7, "s7a.decision", "Decision received and recorded", { sub: "Decision", o: "university", app: true, dep: ["s6a.confirmation"], ev: ["doc:offer_letter"], ext: true, p: "high", t: 20, c: "Done when the university's decision letter is attached. Record it on the application as an offer, rejection or waitlist." });
T(7, "s7.comm_log", "Communication with universities logged", { sub: "Follow-up", o: "consultant", dep: ["s6.all_sent"], ev: ["text:Latest follow-up entry"], t: 5 });

// ---- 8. Offers, Decisions & Acceptance --------------------------------------------------------------------------------------------
T(8, "s8a.offer_record", "Offer details recorded (conditional or unconditional)", { sub: "Offer", o: "consultant", app: true, dep: ["s7a.decision"], ev: ["doc:offer_letter!", "text:Type, conditions and acceptance deadline"], p: "high", t: 0 });
T(8, "s8a.conditions", "Offer conditions understood and met", { sub: "Offer", app: true, dep: ["s8a.offer_record"], ev: ["text:Each condition and how it was met"], r: true, p: "high", t: 20, a: "Report progress" });
T(8, "s8a.deposit", "Deposit paid (if the offer requires it)", { sub: "Offer", app: true, dep: ["s8.decision"], ev: ["doc:deposit_receipt"], r: true, p: "critical", t: 10, a: "Upload receipt" });
T(8, "s8.compare", "Compare your offers side by side", { sub: "Decision", dep: ["s7.comm_log", "any:s8a.offer_record"], ev: ["text:Your comparison: cost, ranking, fit, funding"], p: "high", t: 5, a: "Compare" });
T(8, "s8.decision", "Make your formal decision", { sub: "Decision", dep: ["s8.compare"], ev: ["conf:student:The university and programme you choose, and the date"], p: "critical", t: 12, a: "Record decision", c: "Done when you record, in writing, which offer you accept. The deadline is on the offer letter." });
T(8, "s8.accept", "Acceptance sent to the chosen university", { sub: "Decision", o: "consultant", dep: ["s8.decision"], ev: ["doc:acceptance_letter"], p: "critical", t: 14 });
T(8, "s8.decline_others", "Decline the other offers politely", { sub: "Decision", dep: ["s8.accept"], ev: ["conf:student:Who you informed and when"], t: 18, a: "Record" });
T(8, "s8.enrolment_doc", "Receive your CAS / I-20 / CoE / admission letter for the visa", { sub: "Decision", o: "university", dep: ["s8.accept"], ev: ["doc:enrolment_doc"], ext: true, p: "critical", t: 25 });

// ---- 9. Finance, Funding & Accommodation ----------------------------------------------------------------------------------------
T(9, "s9.cost_plan", "First-year cost estimate prepared", { sub: "Planning", o: "consultant", dep: ["s8.decision"], ev: ["text:Tuition, living, insurance, travel and total"], t: 0, p: "high" });
T(9, "s9.funding_plan", "Funding plan agreed", { sub: "Planning", dep: ["s9.cost_plan"], ev: ["text:Sources of funds and amounts"], t: 3, a: "Write plan" });
T(9, "s9.scholar_apply", "Scholarship applications submitted", { sub: "Scholarships", dep: ["s3.approve"], ev: ["text:Scholarships applied for and dates"], w: flag("wantsScholarship"), min: 3, t: -60, a: "Record" });
T(9, "s9.scholar_result", "Scholarship decision received", { sub: "Scholarships", o: "university", dep: ["s9.scholar_apply"], ev: ["doc:scholarship_letter"], w: flag("wantsScholarship"), ext: true, t: -20 });
T(9, "s9.loan_options", "Education-loan options compared", { sub: "Loan", dep: ["s9.funding_plan"], ev: ["text:Lenders compared: rate, collateral, moratorium"], w: flag("needsLoan"), min: 4, a: "Compare", t: 4 });
T(9, "s9.loan_apply", "Loan application submitted", { sub: "Loan", dep: ["s9.loan_options"], ev: ["conf:student:Lender and application date"], w: flag("needsLoan"), p: "high", t: 8, a: "Record" });
T(9, "s9.loan_sanction", "Loan sanction letter received", { sub: "Loan", dep: ["s9.loan_apply"], ev: ["doc:loan_sanction!"], r: true, w: flag("needsLoan"), ext: true, p: "critical", t: 20, a: "Upload sanction" });
T(9, "s9.funds_proof", "Proof of funds assembled", { sub: "Funds", dep: ["s9.funding_plan"], ev: ["doc:financial!"], r: true, p: "critical", t: 10, a: "Upload documents", d: "Bank statements, fixed deposits, sponsor letters. Visible only to you, your consultant and administrators." });
T(9, "s9.funds_check", "Funds meet the destination's requirement", { sub: "Funds", o: "consultant", dep: ["s9.funds_proof"], ev: ["text:Amount shown vs amount required, and the source checked"], p: "critical", t: 14 });
T(9, "s9.blocked_account", "Blocked account opened (Germany)", { sub: "Funds", dep: ["s9.funding_plan"], ev: ["doc:financial"], r: true, w: dest("germany"), p: "critical", t: 12, a: "Upload confirmation" });
T(9, "s9.tuition", "Tuition or first instalment paid", { sub: "Payments", dep: ["s8.accept"], ev: ["doc:deposit_receipt"], r: true, p: "high", t: 20, a: "Upload receipt" });
T(9, "s9.health_cover", "Health cover arranged", { sub: "Payments", dep: ["s8.accept"], ev: ["doc:insurance"], r: true, w: dest("uk", "australia", "canada", "germany", "usa"), t: 22, a: "Upload policy", d: "Some countries charge a health surcharge or require approved cover. Your consultant will confirm what applies." });
T(9, "s9.accom_options", "Accommodation options compared", { sub: "Accommodation", dep: ["s8.accept"], ev: ["text:Options with price and distance"], w: flag("needsAccommodation"), t: 10, a: "Compare" });
T(9, "s9.accom_booked", "Accommodation booked", { sub: "Accommodation", dep: ["s9.accom_options"], ev: ["doc:accommodation"], r: true, w: flag("needsAccommodation"), p: "high", t: 25, a: "Upload booking" });
T(9, "s9.tenancy_review", "Tenancy agreement reviewed", { sub: "Accommodation", o: "consultant", dep: ["s9.accom_booked"], ev: ["text:Key terms and anything unusual"], w: flag("needsAccommodation"), min: 5, t: 28 });

// ---- 10. Visa & Immigration -----------------------------------------------------------------------------------------------------
const V = "Visa";
const NOTE = " Outcomes are decided only by the immigration authority; follow the official government instructions.";
T(10, "s10.route", "Visa route confirmed", { sub: V, o: "consultant", dep: ["s8.accept"], ev: ["text:Visa category and the official source checked"], p: "high", t: 0, d: "Confirm the correct student visa category." + NOTE });
T(10, "s10.checklist", "Destination-specific visa checklist issued", { sub: V, o: "consultant", dep: ["s10.route"], ev: ["link:Link to the official checklist you used"], p: "high", t: 1 });
T(10, "s10.sevis", "SEVIS fee paid and receipt saved", { sub: "USA (F-1)", dep: ["s8.enrolment_doc"], ev: ["doc:visa_receipt"], r: true, w: dest("usa"), p: "high", t: 3, a: "Upload receipt" });
T(10, "s10.ds160", "DS-160 completed and confirmation saved", { sub: "USA (F-1)", dep: ["s10.sevis"], ev: ["doc:visa_form"], r: true, w: dest("usa"), p: "critical", t: 6, a: "Upload confirmation" });
T(10, "s10.cas", "CAS received and checked (UK)", { sub: "UK (Student route)", o: "university", dep: ["s8.enrolment_doc"], ev: ["doc:enrolment_doc"], w: dest("uk"), ext: true, p: "critical", t: 3 });
T(10, "s10.ihs_atas", "Health surcharge paid; ATAS checked if your course needs it", { sub: "UK (Student route)", dep: ["s10.cas"], ev: ["doc:visa_receipt"], r: true, w: dest("uk"), t: 6, a: "Upload receipt" });
T(10, "s10.coe_gs", "CoE received and Genuine Student statement prepared (Australia)", { sub: "Australia (Student)", dep: ["s8.enrolment_doc"], ev: ["doc:visa_form"], r: true, w: dest("australia"), p: "critical", t: 4, a: "Upload statement" });
T(10, "s10.permit_pal", "Study-permit file prepared with attestation letter and GIC (Canada)", { sub: "Canada (Study permit)", dep: ["s8.enrolment_doc"], ev: ["doc:visa_form"], r: true, w: dest("canada"), p: "critical", t: 4, a: "Upload file" });
T(10, "s10.national_visa", "National visa file prepared with APS / admission proof (Germany)", { sub: "Germany (National visa)", dep: ["s8.enrolment_doc", "s9.blocked_account"], ev: ["doc:visa_form"], r: true, w: dest("germany"), p: "critical", t: 4, a: "Upload file" });
T(10, "s10.campus_france", "Campus France / long-stay visa file prepared (France)", { sub: "France (Long-stay)", dep: ["s8.enrolment_doc"], ev: ["doc:visa_form"], r: true, w: dest("france"), p: "critical", t: 4, a: "Upload file" });
T(10, "s10.uae_visa", "Student residence visa file prepared (UAE)", { sub: "UAE (Student)", dep: ["s8.enrolment_doc"], ev: ["doc:visa_form"], r: true, w: dest("uae"), p: "critical", t: 4, a: "Upload file" });
T(10, "s10.financial_evidence", "Financial evidence matched to the visa rules", { sub: V, o: "consultant", dep: ["s9.funds_check", "s10.checklist"], ev: ["text:Requirement vs evidence shown"], p: "critical", t: 5 });
T(10, "s10.form", "Visa application form completed", { sub: V, dep: ["s10.checklist", "s8.enrolment_doc"], ev: ["doc:visa_form"], r: true, p: "critical", t: 8, a: "Upload form" });
T(10, "s10.medical", "Medical / TB test done where required", { sub: V, dep: ["s10.checklist"], ev: ["doc:medical"], r: true, w: dest("uk", "canada", "australia"), t: 10, a: "Upload certificate", d: "Required for some nationalities and course lengths. Use only an approved panel clinic." });
T(10, "s10.police", "Police clearance obtained where required", { sub: V, dep: ["s10.checklist"], ev: ["doc:police"], r: true, w: dest("canada", "australia", "germany", "france"), t: 10, a: "Upload certificate" });
T(10, "s10.fee", "Visa fee paid and receipt saved", { sub: V, dep: ["s10.form"], ev: ["doc:visa_receipt"], r: true, p: "high", t: 12, a: "Upload receipt" });
T(10, "s10.appointment", "Visa appointment / biometrics booked", { sub: V, dep: ["s10.fee"], ev: ["text:Date, time and centre"], p: "critical", t: 14, a: "Record appointment" });
T(10, "s10.mock", "Mock visa interview completed", { sub: V, o: "consultant", dep: ["s10.appointment"], ev: ["conf:consultant:Date and feedback given"], min: 4, t: 18 });
T(10, "s10.attended", "Appointment / biometrics attended", { sub: V, dep: ["s10.appointment"], ev: ["conf:student:Date attended and anything the officer asked for"], p: "critical", t: 22, a: "Record" });
T(10, "s10.decision", "Visa decision recorded", { sub: V, dep: ["s10.attended"], ev: ["text:Outcome and date as shown by the authority", "doc:visa_grant"], ext: true, p: "critical", t: 30, a: "Record outcome", c: "Done only when the authority's decision (grant) is attached. If the visa is refused, use “Report a visa refusal” so a recovery plan is created." });

// ---- 11. Pre-Departure & Travel -----------------------------------------------------------------------------------------------------
const P = "Pre-departure";
T(11, "s11.flight", "Flight booked", { sub: P, dep: ["s10.decision"], ev: ["doc:travel"], r: true, p: "high", t: 0, a: "Upload booking" });
T(11, "s11.insurance", "Travel and arrival insurance in place", { sub: P, dep: ["s10.decision"], ev: ["doc:insurance"], r: true, t: 1, a: "Upload policy" });
T(11, "s11.forex", "Foreign currency and card arranged", { sub: P, dep: ["s10.decision"], ev: ["text:How you will pay in the first month"], t: 2, a: "Record plan" });
T(11, "s11.accom_ready", "First-night accommodation confirmed", { sub: P, dep: ["s10.decision"], ev: ["doc:accommodation"], r: true, p: "high", t: 2, a: "Upload confirmation" });
T(11, "s11.health", "Vaccinations and prescriptions sorted", { sub: P, dep: ["s10.decision"], ev: ["text:Done or 'not needed'"], t: 4, a: "Record" });
T(11, "s11.docs_carry", "Documents to carry (originals and copies) packed", { sub: P, dep: ["s11.flight"], ev: ["conf:student:Checked the list against your documents"], p: "high", t: 6, a: "Confirm packed" });
T(11, "s11.briefing", "Pre-departure briefing attended", { sub: P, o: "consultant", dep: ["s11.flight"], ev: ["conf:consultant:Briefing date and topics covered"], min: 4, t: 7 });
T(11, "s11.orientation", "Orientation date and arrival instructions saved", { sub: P, dep: ["s8.accept"], ev: ["text:Orientation date and place"], t: 3, a: "Record" });
T(11, "s11.emergency", "Emergency contacts shared with your family and consultant", { sub: P, dep: ["s11.flight"], ev: ["text:Contacts and their numbers (kept private)"], t: 8, a: "Add contacts" });
T(11, "s11.pickup", "Airport pick-up arranged", { sub: P, o: "consultant", dep: ["s11.flight"], ev: ["text:Provider and time"], min: 5, t: 9 });
T(11, "s11.rules", "Customs and carrying rules read", { sub: P, dep: ["s11.flight"], ev: ["conf:student:Rules read (note one thing that surprised you)"], t: 10, a: "Confirm" });
T(11, "s11.ready", "Ready to fly: final check", { sub: P, o: "consultant", dep: ["s11.docs_carry", "s11.insurance", "s11.accom_ready"], ev: ["conf:consultant:Final pre-flight check done"], p: "high", t: 12 });

// ---- 12. Arrival, Enrolment & Alumni (12.A arrival, 12.B after-arrival support) -------------------------------------------------------
const AR = "Arrival";
T(12, "s12.arrived", "Arrived at your destination", { sub: AR, dep: ["s11.ready"], ev: ["conf:student:Arrival date and confirmation you are safe"], p: "high", t: 0, a: "I have arrived", c: "Done when you record your arrival date. This moves you to the Arrived stage." });
T(12, "s12.report", "Reported to your university", { sub: AR, dep: ["s12.arrived"], ev: ["text:Date and who you met"], t: 2, a: "Record" });
T(12, "s12.orientation", "Attended orientation", { sub: AR, dep: ["s12.arrived"], ev: ["conf:student:Date attended"], t: 4, a: "Record" });
T(12, "s12.biometric_card", "Collected your residence permit / BRP / I-94 record where applicable", { sub: AR, dep: ["s12.arrived"], ev: ["text:Document type and collection date, or 'not applicable'"], w: dest("uk", "usa", "canada", "australia", "germany", "france", "uae"), t: 7, a: "Record" });
T(12, "s12.enrolment", "Enrolment completed", { sub: AR, dep: ["s12.report"], ev: ["doc:enrolment_confirmation"], r: true, p: "high", t: 8, a: "Upload confirmation" });
T(12, "s12.student_id", "Student ID collected", { sub: AR, dep: ["s12.enrolment"], ev: ["text:ID number or collection date"], t: 10, a: "Record" });
T(12, "s12.courses", "Course registration done", { sub: AR, dep: ["s12.enrolment"], ev: ["text:Modules registered"], t: 12, a: "Record" });
T(12, "s12.sim", "Local SIM / phone number active", { sub: "After-arrival support", dep: ["s12.arrived"], ev: ["text:Number and date activated"], t: 3, min: 5, a: "Record" });
T(12, "s12.bank", "Local bank account opened", { sub: "After-arrival support", dep: ["s12.arrived"], ev: ["text:Bank and date opened"], p: "high", t: 14, min: 5, a: "Record" });
T(12, "s12.tax_id", "Tax or social-security number obtained", { sub: "After-arrival support", dep: ["s12.enrolment"], ev: ["text:Number type and date applied or received"], t: 21, min: 5, a: "Record" });
T(12, "s12.healthcare", "Registered for healthcare and know how to use your cover", { sub: "After-arrival support", dep: ["s12.arrived"], ev: ["text:Provider and date"], t: 14, a: "Record" });
T(12, "s12.address", "Local address registered where the law requires it", { sub: "After-arrival support", dep: ["s12.arrived"], ev: ["text:Registration reference, or 'not required here'"], w: dest("germany", "uae", "france"), p: "high", t: 10, a: "Record" });
T(12, "s12.checkin30", "30-day check-in call", { sub: "After-arrival support", o: "consultant", dep: ["s12.arrived"], ev: ["conf:consultant:Date and welfare notes"], t: 30, min: 5 });
T(12, "s12.checkin90", "90-day check-in call", { sub: "After-arrival support", o: "consultant", dep: ["s12.checkin30"], ev: ["conf:consultant:Date and welfare notes"], t: 90, min: 5 });
T(12, "s12.feedback", "Share feedback about your journey", { sub: "Alumni", dep: ["s12.enrolment"], ev: ["text:What worked and what to improve"], t: 45, a: "Give feedback" });
T(12, "s12.alumni", "Joined the GrowQR alumni network", { sub: "Alumni", dep: ["s12.enrolment"], ev: ["conf:student:Joined; add your university and course"], t: 60, a: "Join alumni" });

// ---- 13. Internships abroad (opt-in track) ---------------------------------------------------------------------------------------------
const IN = flag("wantsInternship");
T(13, "s13.rights", "Work rights for internships checked for your visa", { sub: "Eligibility", o: "consultant", dep: ["s10.decision"], ev: ["text:What your visa allows, with the official source"], w: IN, p: "high", t: -60 });
T(13, "s13.goals", "Internship goals and target roles defined", { sub: "Preparation", dep: ["s12.enrolment"], ev: ["text:Target roles, industries and timing"], w: IN, t: -45, a: "Define goals" });
T(13, "s13.cv_local", "CV localised for the host country", { sub: "Preparation", dep: ["s13.goals"], ev: ["doc:cv"], r: true, w: IN, t: -30, a: "Upload CV", min: 5 });
T(13, "s13.targets", "Target employer list built", { sub: "Search", dep: ["s13.goals"], ev: ["text:At least 10 employers"], w: IN, t: -20, a: "Add list" });
T(13, "s13.applied", "Internship applications sent", { sub: "Search", dep: ["s13.cv_local", "s13.targets"], ev: ["text:Number sent and where"], w: IN, t: -5, a: "Log applications" });
T(13, "s13.interviews", "Interview preparation done", { sub: "Search", dep: ["s13.applied"], ev: ["text:Practice notes"], w: IN, t: 10, a: "Log", min: 3 });
T(13, "s13.offer", "Internship offer received and employer verified", { sub: "Offer", o: "consultant", dep: ["s13.applied"], ev: ["doc:offer_letter", "text:How the employer was verified"], w: IN, p: "high", t: 25 });
T(13, "s13.authorisation", "Work authorisation confirmed (CPT / placement / co-op or equivalent)", { sub: "Offer", o: "consultant", dep: ["s13.offer", "s13.rights"], ev: ["text:Authorisation type, reference and approver"], w: IN, p: "critical", t: 30 });
T(13, "s13.complete", "Internship completed with a completion letter", { sub: "Outcome", dep: ["s13.authorisation"], ev: ["doc:other"], r: true, w: IN, t: 120, a: "Upload letter" });

// ---- 14. Part-time jobs abroad (opt-in track) -------------------------------------------------------------------------------------------
const PT = flag("wantsPartTime");
T(14, "s14.rules", "Part-time work rules for your visa understood", { sub: "Rules", dep: ["s10.decision"], ev: ["conf:student:Hours cap and conditions in your own words"], w: PT, p: "high", t: -30, a: "Confirm" });
T(14, "s14.rights_check", "Work rights verified by your consultant", { sub: "Rules", o: "consultant", dep: ["s14.rules"], ev: ["text:Hours cap, term vs holiday rules and the source"], w: PT, p: "high", t: -25 });
T(14, "s14.tax", "Tax / social-security number ready to work", { sub: "Setup", dep: ["s12.tax_id"], ev: ["text:Status"], w: PT, t: -10, a: "Record" });
T(14, "s14.cv", "Local-format CV for part-time roles", { sub: "Setup", dep: ["s14.rules"], ev: ["doc:cv"], r: true, w: PT, t: -10, a: "Upload CV", min: 5 });
T(14, "s14.plan", "Job-search plan (on-campus first)", { sub: "Search", dep: ["s14.rights_check"], ev: ["text:Where you will look, weekly target"], w: PT, t: 0, a: "Write plan" });
T(14, "s14.offer_check", "Job offer checked: legal employer, hours and pay", { sub: "Search", o: "consultant", dep: ["s14.plan"], ev: ["text:Employer, hours, pay and checks done"], w: PT, p: "high", t: 20 });
T(14, "s14.hours", "Working hours tracked within the legal limit", { sub: "Compliance", dep: ["s14.offer_check"], ev: ["text:This month's hours vs the cap"], w: PT, p: "high", t: 45, a: "Log hours" });
T(14, "s14.payslip", "First payslip received and checked", { sub: "Compliance", dep: ["s14.offer_check"], ev: ["doc:other"], r: true, w: PT, t: 50, a: "Upload payslip" });

// ---- Recovery tasks (created by exceptions; history is kept, nothing is deleted) ------------------------------------------------------------
function R(key: string, title: string, o: Opt, stage: number): TaskDef {
  const before = tasks.length;
  T(stage, key, title, o);
  return tasks.splice(before, 1)[0];
}
const RECOVERY: Record<string, TaskDef[]> = {
  visa_refusal: [
    R("rx.visa.letter", "Upload the visa refusal letter", { sub: "Visa refusal recovery", ev: ["doc:visa_refusal"], r: true, p: "critical", t: 3, a: "Upload letter" }, 10),
    R("rx.visa.analysis", "Refusal reasons analysed with your consultant", { sub: "Visa refusal recovery", o: "consultant", dep: ["rx.visa.letter"], ev: ["text:Stated reasons and what can be corrected"], p: "critical", t: 6 }, 10),
    R("rx.visa.options", "Choose the next step: reapply, appeal, or an alternative", { sub: "Visa refusal recovery", dep: ["rx.visa.analysis"], ev: ["conf:student:The option you choose and why"], p: "critical", t: 10, a: "Decide" }, 10),
    R("rx.visa.plan", "Recovery plan with dates agreed", { sub: "Visa refusal recovery", o: "consultant", dep: ["rx.visa.options"], ev: ["text:Plan, dates and honest chances. No outcome can be promised"], p: "high", t: 12 }, 10),
  ],
  rejection: [
    R("rx.rej.letter", "Record the decision letter", { sub: "Rejection recovery", ev: ["doc:rejection_letter"], r: true, p: "high", t: 2, a: "Upload letter" }, 8),
    R("rx.rej.review", "Review feedback and your remaining options", { sub: "Rejection recovery", o: "consultant", dep: ["rx.rej.letter"], ev: ["text:What the feedback suggests and options (other intakes / universities)"], p: "high", t: 5 }, 8),
    R("rx.rej.next", "Decide: add another university, change intake, or stop", { sub: "Rejection recovery", dep: ["rx.rej.review"], ev: ["conf:student:Your decision"], p: "high", t: 8, a: "Decide" }, 8),
  ],
  deferral: [
    R("rx.def.confirm", "Deferral confirmed in writing by the university", { sub: "Deferred intake", ev: ["doc:other"], r: true, p: "high", t: 5, a: "Upload confirmation" }, 8),
    R("rx.def.replan", "Timeline re-planned for the new intake", { sub: "Deferred intake", o: "consultant", dep: ["rx.def.confirm"], ev: ["text:What moved and the new key dates"], p: "high", t: 8 }, 8),
  ],
  withdrawal: [
    R("rx.wd.close", "Withdrawal confirmed with the university or service", { sub: "Withdrawal", o: "consultant", ev: ["text:Who was told, when, and any fees affected"], p: "high", t: 3 }, 8),
  ],
  refund: [
    R("rx.rf.request", "Refund request reviewed against the package terms", { sub: "Refund", o: "consultant", ev: ["text:Terms applied and the decision"], p: "high", t: 5 }, 9),
  ],
};

export const BUILTIN_TEMPLATE: TemplateDef = { key: "overseas-v1", name: "Overseas education journey", stages: STAGES, tasks, recovery: RECOVERY, reviewedOn: REVIEWED_ON };
