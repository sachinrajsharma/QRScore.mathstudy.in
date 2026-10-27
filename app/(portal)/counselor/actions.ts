"use server";

import { redirect } from "next/navigation";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import { putSessionData } from "@/lib/portal/session";
import * as AB from "@/lib/abroad/store";
import * as CN from "@/lib/abroad/counsel";
import * as MI from "@/lib/abroad/mock-interview";
import * as VT from "@/lib/abroad/vault";

/** Counselor Server Actions. A counselor may only touch students assigned to them (admins any); every action re-checks that. */
const flash = (kind: "ok" | "err", text: string) => putSessionData({ console_flash: [kind, text] });
const s = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string): number => parseInt(s(fd, k), 10) || 0;

async function staff(here: string) {
  const me = await requireUser("counselor", "admin");
  await requireMfaIfStaff(me, here);
  return me;
}

export async function claimStudentAction(fd: FormData): Promise<void> {
  const me = await staff("/counselor");
  const err = me.role === "counselor" ? await CN.claim(me.id, n(fd, "student_id")) : "Only counselors take students; admins assign them.";
  await flash(err ? "err" : "ok", err ?? "Student added to your caseload.");
  redirect("/counselor?legacy=1");
}

export async function studentAction(fd: FormData): Promise<void> {
  const sid = n(fd, "student_id");
  const me = await staff(`/counselor/student/${sid}`);
  if (!sid || !(await CN.canAccess(me, sid))) redirect("/counselor?legacy=1");
  const act = s(fd, "act");
  const id = n(fd, "id");
  let err: string | null = null;
  let msg = "Done.";
  if (act === "doc_verify" || act === "doc_reject") {
    const d = await VT.find(id);
    if (!d || Number(d.user_id) !== sid) err = "Document not found."; // a counselor can only touch this student's files
    else {
      err = await CN.reviewDoc(me.id, id, act === "doc_verify", s(fd, "reason"));
      msg = act === "doc_verify" ? "Document verified." : "Document rejected and the student was notified.";
    }
  } else if (["to_applied", "to_draft", "to_offer", "to_declined"].includes(act)) {
    const app = await AB.application(id);
    if (!app || app.user_id !== sid) err = "Application not found.";
    else {
      err = await AB.adminMove(id, act.slice(3), me.id, s(fd, "note"), s(fd, "offer_type"));
      msg = "Application updated and the student was notified.";
    }
  } else if (act === "note") {
    err = await CN.addNote(sid, me.id, String(fd.get("body") ?? ""));
    msg = "Note saved. Only staff can see notes.";
  } else err = "Unknown action.";
  await flash(err ? "err" : "ok", err ?? msg);
  redirect(`/counselor/student/${sid}`);
}

export async function mockFeedbackAction(fd: FormData): Promise<void> {
  const sess = await MI.session(n(fd, "id"));
  const me = await staff(`/counselor/mock/${sess?.id ?? 0}`);
  if (!sess || sess.finished_at === null || !(await CN.canAccess(me, Number(sess.user_id)))) redirect("/counselor?legacy=1");
  const err = await MI.addFeedback(sess.id, me.id, String(fd.get("body") ?? ""));
  await flash(err ? "err" : "ok", err ?? "Feedback sent. The student was notified.");
  redirect(`/counselor/mock/${sess.id}`);
}
