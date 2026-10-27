import { run } from "../portal/db";
import * as funds from "./funds";
import * as loans from "./loans";
import * as mock from "./mock-interview";
import * as S from "./store";
import * as vault from "./vault";
import * as visa from "./visa";
import { eraseJourney, exportJourney } from "../journey/privacy";

/** Study-abroad data export and erasure for the student (port of AbroadStore::export / erase). */
const pick = <T extends Record<string, unknown>>(o: T, keys: string[]): Record<string, unknown> => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

export async function exportData(uid: number): Promise<Record<string, unknown>> {
  const sessions = await mock.sessionsFor(uid, 60);
  const sessionOut = [];
  for (const s of sessions) {
    const rows = Object.entries(await mock.answers(Number(s.id))).map(([qid, a]) => ({ question: mock.question(String(s.country_key), qid)?.q ?? qid, answer: a.answer, coverage: a.coverage }));
    sessionOut.push({ country: s.country_key, started: s.created_at, score: s.score, answers: rows, feedback: (await mock.feedback(Number(s.id))).map((f) => f.body) });
  }
  return {
    exported_at: new Date().toISOString(),
    profile: await S.profile(uid),
    shortlist: await (async () => (await Promise.all((await S.shortlistIds(uid)).map(async (id) => (await (await import("./catalogue")).universityById(id))?.name))).filter(Boolean))(),
    applications: (await S.applications(uid)).map((a) => pick(a as unknown as Record<string, unknown>, ["uni_name", "program", "intake", "status", "offer_type", "offer_note", "created_at", "updated_at"])),
    documents: (await vault.forUser(uid)).map((d) => pick(d as unknown as Record<string, unknown>, ["doc_type", "original_name", "size", "status", "created_at"])),
    status_history: await S.historyFor(uid, 200),
    funds: (await funds.sources(uid)).map((f) => pick(f as unknown as Record<string, unknown>, ["kind", "label", "amount_inr", "created_at"])),
    visa_cases: (await visa.forUser(uid)).map((v) => pick(v as unknown as Record<string, unknown>, ["uni_name", "stage", "appointment_at", "biometrics_at", "centre", "notes"])),
    journey: await exportJourney(uid),
    mock_interviews: sessionOut,
    loans: (await loans.forUser(uid)).map((l) => pick(l as unknown as Record<string, unknown>, ["lender", "loan_type", "amount_inr", "rate_pct", "tenure_years", "moratorium_months", "status", "sanctioned_inr"])),
  };
}

/** Erase all study-abroad data (files and rows) for a student. The audit trail records the erasure only. */
export async function erase(uid: number): Promise<void> {
  await vault.deleteAllFor(uid);
  await eraseJourney(uid);
  for (const t of ["sa_applications", "sa_shortlist", "sa_status_history", "sa_mock_sessions", "sa_funds", "sa_loans", "sa_profiles"]) await run(`DELETE FROM ${t} WHERE user_id = $1`, [uid]);
  await run("DELETE FROM sa_notes WHERE student_id = $1", [uid]);
  await S.audit(uid, uid, "data.erase");
}
