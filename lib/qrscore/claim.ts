import "server-only";
import { one, run } from "../portal/db";
import * as passport from "../portal/passport/profile";
import * as resumes from "../portal/passport/resumes";
import * as share from "../portal/passport/share";
import { available as signingAvailable } from "../portal/passport/credential";
import { candidateId, rescore, type GuestScan } from "./guest";

/** Give a new student their readable QR ID. Retries on the rare clash; it never changes an ID a student already has. */
export async function assignQrId(userId: number, fullName: string): Promise<string> {
  const have = await one<{ qr_id: string | null }>("SELECT qr_id FROM student_profiles WHERE user_id = $1", [userId]);
  if (have?.qr_id) return have.qr_id;
  for (let i = 0; i < 12; i++) {
    const id = candidateId(fullName);
    try {
      const changed = await run("UPDATE student_profiles SET qr_id = $1 WHERE user_id = $2 AND qr_id IS NULL", [id, userId]);
      if (changed > 0) return id;
      const now = await one<{ qr_id: string | null }>("SELECT qr_id FROM student_profiles WHERE user_id = $1", [userId]);
      if (now?.qr_id) return now.qr_id;
    } catch {
      /* the ID is taken by someone else: try the next one */
    }
  }
  throw new Error("Could not allocate a QR ID.");
}

export interface Attached { qrId: string; score: number; published: boolean }

/**
 * Turn a visitor's scanned resume into a saved Skill Passport for a brand-new account: save the scored resume, give the student a QR ID and, when they
 * ticked the box and passport signing is set up on this server, make the QR page public (first name and initial plus the score only).
 */
export async function attachGuestScan(userId: number, fullName: string, scan: GuestScan, opts: { publish: boolean }): Promise<Attached> {
  const result = rescore(scan);
  if (!result) throw new Error("That resume could not be scored again.");
  await passport.saveResult(userId, result, scan.fileName, scan.text);
  await resumes.saveAccepted(userId, result, scan.text, { name: scan.fileName ?? "", mime: scan.fileMime, size: scan.fileSize });
  // The QR ID is a nicety: if it cannot be made (for example the database has not been migrated yet) the scan is still saved.
  const qrId = await assignQrId(userId, fullName).catch((e) => { console.error("[claim] QR ID failed:", (e as Error).message); return ""; });
  let published = false;
  if (opts.publish && signingAvailable()) {
    try {
      await share.publish(userId, fullName, { name_style: "first_initial", show_score: true, show_skills: false, show_courses: false, show_college: false });
      published = true;
    } catch {
      /* the QR can be turned on later from the dashboard */
    }
  }
  return { qrId, score: result.overall.score, published };
}
