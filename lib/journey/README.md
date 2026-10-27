# Overseas Education Journey Management System

An upgrade of the original seven-card study-abroad tracker (Profile, Documents, Review, Applied, Offer, Visa, Arrived) into a configurable,
versioned workflow. Every task has an owner, status, due date, dependencies, required evidence, a plain-language completion condition and a full
event history. **A task never completes because a page was opened or a button was clicked**: completion needs the evidence the task asks for, a
written note, and (for reviewed tasks) a staff approval.

Branch `feat/overseas-journey` (worktree `growqr-overseas`). Not merged to GrowQR `main`.

## 1. What was found in the codebase (inspection)

| Area | Where | How it is reused |
|---|---|---|
| The old tracker | `app/(portal)/abroad/page.tsx`, `lib/abroad/store.ts` (`sa_profiles.stage`, `sa_applications.status`), seven cards from `A.STAGES` | Left working. A banner links to the journey; the journey shows the same seven cards computed from the new stages (`legacy.ts`). |
| Auth and roles | `lib/portal/session.ts` roles `student, counselor, admin, ...`; `requireUser`, `requireMfaIfStaff` | "Consultant" = `counselor`, "manager" = `admin`. No new roles. |
| Packages and payments | `lib/abroad/packages.ts` (5 levels, sku `abroad-<key>`, kind `consulting`), `pay_entitlements` (`lib/pay/entitlements.ts`) | `packageLevel()` reads the **verified active entitlement**: nothing in this system can grant a package. |
| Documents | `lib/abroad/vault.ts` (private bucket, scanner, signed links) | Same storage, scanner and signing approach, extended with versions, expiry and an access log (`docs.ts`). |
| Notifications and mail | `lib/portal/mail.ts` (`send`, outbox queue, `flushMail`) | Email goes through the existing outbox. In-app notifications are new (`oj_notifications`). |
| Counselor / admin screens | `/counselor`, `/console/*`, `ConsolePage` | New pages sit beside them: `/counselor/journey`, `/console/journey`. |
| Cron pattern | `app/api/cron/*` with `CRON_SECRET` | `app/api/cron/journey`. |

## 2. Mapping the seven cards onto the new workflow

```
Profile    -> stages 1-3   (Profile & Counselling, Eligibility, Shortlisting)
Documents  -> stage 4      (Document Collection & Verification)
Review     -> stage 5      (Exams & Application Preparation, readiness check)
Applied    -> stages 6-7   (Submission, Follow-up & Interviews)
Offer      -> stages 8-9   (Offers & Decisions, Finance/Funding/Accommodation)
Visa       -> stages 10-11 (Visa & Immigration, Pre-departure)
Arrived    -> stage 12     (Arrival, Enrolment & Alumni, after-arrival support)
```

**The three extra areas (decision).** *After-arrival support* is part of stage 12 (sub-group "After-arrival support": SIM, bank, tax number,
healthcare, 30/90-day check-ins). *Internships abroad* (stage 13) and *Part-time jobs abroad* (stage 14) are **opt-in tracks**: they are only
generated when the student ticks them in the setup, so they never drag the progress percentage of students who do not want them. They depend on the
visa decision and enrolment, because work rights come from the visa.

**Migration of existing students.** `startJourney()` creates the case from the student's answers, then `importLegacy()` copies their
`sa_applications` (with status mapped: draft/in_review -> preparing, applied -> submitted, offer, accepted, declined) and copies their `sa_documents`
(files are copied to new random names, so deleting a legacy document never breaks the journey). **Nothing is marked done by the import.** Only
automatic checks that *prove* a fact complete tasks (email confirmed, profile saved with consent, shortlist mix, core documents verified by staff).
A consultant who has actually seen proof that early stages are done can use "Carry over earlier progress", which completes each task with their written
confirmation and an audit entry. The old pages and tables are untouched, so rollback is just not linking to the new pages.

## 3. Architecture

```
lib/journey/
  types.ts            statuses, roles, evidence kinds, document types, TaskDef/TemplateDef
  default-template.ts the built-in template: 14 stages, 160+ task definitions with conditions, evidence and dependencies, plus recovery tasks
  template.ts         validation (zod + unknown deps + cycles + evidence), condition evaluation, personalisation, dependency resolution, version diff
  engine.ts           PURE rules: dates, overdue, dependencies, blocked explanations, transitions, evidence gaps, progress, next actions, entitlement lock, intake risk
  store.ts            DB: templates (immutable versions), cases, task generation, dependency rows, evidence, events, settings, package level
  service.ts          task moves (permission + evidence checked), N/A request and approval, automatic checks, review queue, dashboard view model
  apps.ts             applications (one per university + programme + intake)
  docs.ts             versioned documents, review, signed links, access log
  notify.ts           in-app + email notifications, de-duplication, preferences, the reminder / escalation sweep
  exceptions.ts       visa refusal, reapply, rejection, deferral, change university, withdrawal, refund
  workspace.ts        assignment + handover, communication log, reminders, caseload filters, deadlines, risk alerts, CSV
  analytics.ts        figures from real rows only, with a minimum cohort
  legacy.ts           seven-card mapping, import, carry-over
  privacy.ts          student export and erasure
```

Tables (`db/migrations/20261228000001_overseas_journey.sql`, all `oj_*`, idempotent): `oj_templates, oj_cases, oj_applications, oj_tasks,
oj_task_deps, oj_events (append-only), oj_documents, oj_doc_access, oj_evidence, oj_comm, oj_handovers, oj_reminders, oj_notifications,
oj_notif_prefs, oj_settings, oj_exceptions`. Case rows cascade when the account is deleted.

### The task contract

Each task row has: unique id, case, optional application (per-university tasks), template key and version it came from, stage and sub-stage, title,
description, owner role (`student | consultant | university`) and owner user, priority, status, due date, `review` (`none | consultant`),
completion criteria, evidence requirements (JSON), minimum package level, dependencies (`oj_task_deps`), N/A reason and approver, started,
submitted and completed timestamps with who, and its event history in `oj_events`.

### Statuses

Not Started, Ready to Start, In Progress, Submitted for Review, Changes Requested, Waiting on Student, Waiting on University, Blocked, Completed,
Not Applicable. **Overdue is not a status**: it is calculated (`isOverdue`: due date passed and not completed / not applicable).
*Ready to Start* and the dependency form of *Blocked* are also calculated from the dependency rows (`effectiveStatus`), so they can never drift out
of date; a **manual** block (staff give a reason) is stored. A task waiting on the university is still flagged overdue, but its delay is attributed to
the university (`delayParty`) and is never counted as the student's: the student dashboard's "Overdue (yours)" counts only student-side delays.

### Transitions (engine.ts `checkTransition`)

* Student, own tasks only: start; submit for review (all student-side evidence present); complete a no-review task (evidence + note); mark waiting on a
  third party (only tasks flagged external); cannot complete a reviewed task, cannot block, cannot mark N/A directly.
* Staff (assigned counselor or admin): approve (reviewed task -> completed, needs verified documents where the task says so), request changes (needs a
  note), waiting on student / university, blocked (needs a reason), complete with evidence, reopen (needs a reason).
* Not applicable is its own flow: a reason + a **different** approver (students ask staff; staff ask an administrator; critical steps cannot be
  dropped by a student). Events: `na.requested`, `na.approved`, `na.declined`.
* Completion effects on applications happen only after verified completion: submission needs a *verified* proof-of-submission document before the
  application becomes "submitted"; an unconditional offer closes the "conditions" task as N/A with a recorded reason and approver.
* A staff-delivered service above the student's paid package cannot be completed (`This service is not part of the student's package`).

### Templates, personalisation and versions

`CaseProfile` (destination, degree level, intake, visa route, English exemption, entrance tests, funding/loan, scholarship, accommodation, work
experience, study gap, portfolio, internship, part-time) drives `when` conditions on tasks, e.g. UK -> CAS, health surcharge, TB test; USA -> SEVIS,
DS-160; Germany -> blocked account, APS/national visa. Per-university tasks (checklist, SOP tailoring, fee, form, sign-off, submission with proof,
acknowledgement, interview, decision, offer record, conditions, deposit) are generated for **each application separately**.

Templates are immutable once stored. Editing = publishing a new version (admin console: validate -> preview diff -> publish). **Existing cases keep
the version they started on**; a new student gets the newest. `diffTemplates()` shows what a case would gain or lose; nothing is rewritten silently.
When the code's built-in template changes, it is stored as the next version the first time it is needed.

### Dependencies

Edges are resolved per concrete task (`resolveDeps`): per-application -> same application; per-application -> case task -> the one case task; case task
-> per-application tasks -> all of them (`any:` = one is enough). `blockInfo()` explains **why** a task is blocked (the unmet tasks, who owns them) and
**how to unblock** in the viewer's words ("Your consultant will complete X"). Cycles are rejected when a template is validated. A reapplication after a
visa refusal creates a new attempt of the visa tasks; downstream tasks wait on the **latest** attempt.

### Progress, risk and next actions (formulas)

* Progress % = completed / (all live tasks - not applicable - obsolete - locked-by-package). Per stage the same. Rounded.
* Intake risk: expected progress = share of the time between case start and 30 days before intake that has passed. **High** when the intake is within
  150 days and progress is more than 20 points behind, a critical task is overdue, or the intake has passed. **Watch** when behind by 10+ points
  within 240 days, or 3+ tasks overdue. It is a planning warning, never a prediction of a decision.
* Next actions = the student's own open, unblocked tasks; overdue first, then priority (critical > high > normal > low), then due date.

### Entitlements

Tasks carry `minLevel` (1-5, the package levels in `lib/abroad/packages.ts`). A **consultant-delivered** task above the paid level is shown as
"Included in <package>" (locked, with a link), excluded from the progress denominator, and cannot be completed. Student-owned tasks and every
**critical-priority** task are never locked, so critical deadlines and the student's own work are never hidden. Where expert help exists only in a
higher package, a note says so. The level comes only from an active `pay_entitlements` row of kind `consulting` created by a verified payment
(tested with the real order, fake-provider payment and confirmation path).

### Notifications, reminders and escalation

`oj_notifications` has `UNIQUE(user_id, dedupe_key)`, so a reminder or escalation is created at most once. `runSweep()` (cron `GET
/api/cron/journey` with `Authorization: Bearer $CRON_SECRET`, or the admin's "Run reminders now") sends: reminders at the configured days before a
due date (default 7, 3, 1, 0; only the nearest threshold, only to someone who can act); overdue alerts; level 1 escalation to the consultant when a
student task is `consultantAfterDays` (2) late; level 2 to administrators at `managerAfterDays` (7); a university follow-up every
`universityFollowupDays` (7) **to the consultant, never to the student**; review-SLA alerts (3 days); document-expiry warnings (30 days); staff's own
reminders. Event-driven: review needed, approved, changes requested, we-need-something, task ready, N/A requested/decided, assignment, exceptions.
Preferences: a person who turns off email gets no email; turns off in-app gets nothing unread; a **critical** overdue alert still shows in the app.
Rules are editable in the admin console and stored in `oj_settings`.

### Documents and audit

Uploads are scanned (same scanner as the vault), sniffed by file signature, stored under random names in the private bucket, and **versioned**: a new
upload becomes version n+1 and the previous version is marked `superseded`, never overwritten or deleted. Staff verify or reject the newest version
(a rejection needs a reason the student sees). Documents with an expiry date are marked expired by the sweep and stop counting as evidence.
Files are served only through `/abroad/journey/doc/<id>?exp&sig`: a 5-minute HMAC link bound to the signed-in viewer, 404 otherwise, `no-store`,
sandboxed CSP. Passports, financial, loan, medical, police and visa documents are `restricted`: only the student, the assigned consultant and
administrators can open them (admins with two-step login on), and **every open is logged** (`oj_doc_access`). There are no public file URLs.
`oj_events` is append-only and records every status change (from, to, actor, role, note), evidence, upload, review, assignment, exception and export.

### Roles and visibility

| | Student | Counselor | Admin |
|---|---|---|---|
| Own case | yes (only) | - | - |
| Assigned cases | - | yes | yes |
| Unassigned cases | - | list only, can claim | yes, can assign |
| Reassign + handover history | - | own cases | any |
| Analytics, template, rules | - | - | yes |
| Student's staff-only notes / comm log | no | assigned | yes |

### Exceptions and recovery

Student or staff **request**, staff **apply**. Visa refusal (visa decision blocked; recovery tasks), visa reapply (new attempt; the old attempt is
closed as superseded), rejection (only that application closes; recovery tasks), deferred intake (case and application intake move, open
intake-based deadlines are recomputed, history kept), change of university (old closed with reason, new application with its own checklist),
withdrawal (all open tasks closed as N/A with reason, case marked withdrawn, record kept), refund request (recorded, administrators notified, **the
payments console decides and pays**: this system never moves money). Nothing is deleted. No flow promises an outcome.

### Analytics (real data only)

Funnel (journeys started -> shortlist approved -> submitted -> offer -> accepted -> visa granted with proof -> arrived), stage completion and
turnaround, who is holding things up (overdue days attributed to student / consultant / university), bottleneck tasks, consultant workload, intake-risk
counts, progress by destination. **Groups with fewer than 5 journeys show counts but not rates or averages.** With no data every figure is zero and the
page says so. Nothing is simulated.

## 4. Deploy

1. `npm run portal:migrate` (or `PORTAL_AUTO_MIGRATE=1`): applies `20261228000001_overseas_journey.sql` (new tables only; no existing table changes).
2. Schedule `GET https://<site>/api/cron/journey` with `Authorization: Bearer <CRON_SECRET>` (daily is enough; hourly is better). On Hostinger use
   the cron job panel with `curl`. Without it nothing breaks: reminders just wait for an admin to press "Run reminders now".
3. Email uses the existing `RESEND_API_KEY` / mail outbox settings. **Requires external credentials**: without a mail provider key, emails queue and
   are not sent; in-app notifications still work.
4. Make sure at least one user has the `counselor` role and that cases are assigned (admin console -> Journey, or `/counselor/journey`).
5. Rollback: remove the nav links (`components/portal/shell.tsx`, `console-page.tsx`) and the banner in `abroad/page.tsx`; the `oj_*` tables can stay.

## 5. Honest limits

* The visa, document and fee rules in the template are a reviewed summary (see `reviewedOn`), not legal advice, and change often. Each visa task says
  to follow the official government instructions. **A counsellor or editor must review the template per destination before launch.**
* No admission, scholarship or visa outcome is promised anywhere. Categories (ambitious / target / safer) are a planning aid.
* Only seven destinations from the existing catalogue (USA, UK, Canada, Germany, Australia, France, UAE) have destination-specific visa tasks; others
  use the generic steps.
* Email delivery needs the mail provider credentials already used by the portal. Nothing was sent from this build.
* There is no live integration with universities or immigration portals: staff record what the university or authority said and attach proof.
* Refund handling only records and routes the request; it does not call the payments refund API.
* The reminder sweep loads each active case in turn: fine for hundreds of cases, but at thousands it should be moved to a batched query.
* Existing `sa_*` pages and the earlier tracker are not kept in sync from the journey except `sa_profiles.stage` (set to ALUMNI on arrival) and
  `counselor_id` (kept equal on assignment).
* Not done: the optional "recommendations" engine beyond next-actions and risk alerts, SMS/WhatsApp, calendar invites, offer-comparison scoring, and
  bulk reassign. Student-facing a11y was checked by structure (headings, labels, 44px targets, text status, no colour-only meaning); no screen-reader
  session was run.
