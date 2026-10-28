# lib/qrscore: the RQ Score engine in TypeScript

Port of the PHP scoring engine (`../qrscore/src`) so GrowQR's resume scoring runs inside the Next.js app. Same rubric, dictionaries, recommendations and learned model (the JSON files in `data/` are copied unchanged), same results.

```ts
import { scoreText, scoreFile, isScored } from "@/lib/qrscore";   // scoreFile lives in "@/lib/qrscore/extract"

const r = scoreText(resumeText);
if (isScored(r)) {
  r.overall.score;     // 0-100
  r.grade;             // Excellent | Strong | Good | Needs work | Weak
  r.sections;          // five sections with per-parameter scores and reasons
  r.profile;           // structured profile (education, experience, skills, ...)
} else {
  r.gate;              // "this is not a resume" verdict with reasons
}
```

For uploads (PDF, DOCX, TXT): `await scoreFile(bytes, filename)` from `./extract` (server-side only).

## Layout

| File | PHP original |
|---|---|
| `index.ts` | `QrScore.php` (facade) |
| `resume-gate.ts` + `data/gate.json` | `Extract/ResumeGate.php` |
| `segmenter.ts`, `education-parser.ts`, `profile.ts` | `Extract/*` |
| `career-stage.ts` | `Score/CareerStage.php`, `DomainDetector.php` |
| `scorers/{education,experience,skills,projects,impact}.ts` | `Score/*Scorer.php` |
| `score-engine.ts`, `recommender.ts`, `advice.ts` | `Score/ScoreEngine.php`, `Recommender.php`, `Advice.php` |
| `ml.ts` | `Ml/FeatureVector.php`, `Model.php`, `Trainer::predict` |
| `extract.ts` | `Extract/TextExtractor.php`, `DocxExtractor.php`, `PdfExtractor.php` (pdf.js only) |
| `php.ts` | PHP built-ins whose behaviour differs from JavaScript (round, str_word_count, trim with byte lists, PCRE-style `\s`) |

## Keeping it equal to PHP

`parity.test.ts` scores 333 inputs (fixtures plus Unicode/edge variants) and requires the result to equal the PHP engine's, field by field. To refresh after changing the PHP engine or its data files:

```
php scripts/qrscore-golden.php
npx vitest run lib/qrscore
```

The year is part of the maths (years of experience), so the golden file records the year it was made and the test pins it (`setNowYear`).

## Known differences

- Scanned (image-only) PDFs are not OCR'd yet.
- PDF text comes from pdf.js, not Poppler, so line breaks in some PDFs can differ and move a score slightly. Text, DOCX and pasted input are identical to PHP.
- Not ported here: `Ml/Trainer` (offline training CLI), which stays in PHP until training moves too.

## Home page scan, QR ID and the dashboard (guest flow)

A visitor can drop a resume into the box on the home page and see a QR Score without an account.

1. `app/start/actions.ts` (`scanResumeAction`) checks the file (PDF, DOCX or TXT, up to 5 MB), rate-limits by IP, reads and scores it with the same deterministic engine, and keeps the extracted text and a summary in the visitor's anonymous session for 24 hours (`lib/qrscore/guest.ts`). The file itself is not stored.
2. `/score` shows the result: the score ring, the five areas, the three best fixes, and a sign-up form pre-filled from the resume (name, email, college).
3. Sign-up (`signupAction`, with the hidden `claim` field) creates the account, then `lib/qrscore/claim.ts` re-scores the stored text, saves it as the student's passport and current resume, gives them a **QR ID** (`GQ-RIYA-4821`, column `student_profiles.qr_id`, unique) and, if they ticked the box and `PASSPORT_SIGNING_SEED` is set, makes the QR page public (first name, last initial and score only). The student chooses their own password; the form can suggest a strong one.
4. The dashboard (`components/portal/QrDashboard.tsx`) shows the score, the QR code and ID, and "What to do next" (`lib/nextsteps`): rules over the weakest areas, the career stage and the resume's skills pick courses, internships, jobs, interview practice, tests, plans and study abroad.

**Honest limits.** Jobs (`lib/nextsteps/sample-jobs.ts`) and the internship cards are SAMPLE data and are labelled that way on screen; replace them with a real feed when one exists. The QR code only appears once the passport is public, which needs `PASSPORT_SIGNING_SEED` on the server. The resume reader sometimes mis-parses a field (a year as a college, a section label inside a skill); the guest flow cleans the two known cases and lets the student edit the sign-up form.
