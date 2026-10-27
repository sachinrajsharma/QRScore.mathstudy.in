"use server";

import { redirect } from "next/navigation";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import { putSessionData } from "@/lib/portal/session";
import { flashValue } from "@/components/journey/flash";
import * as AP from "@/lib/journey/apps";
import * as DC from "@/lib/journey/docs";
import * as EX from "@/lib/journey/exceptions";
import * as LG from "@/lib/journey/legacy";
import * as SV from "@/lib/journey/service";
import * as WS from "@/lib/journey/workspace";
import { DOC_KEYS, type Status } from "@/lib/journey/types";

/** Staff Server Actions for the journey workspace. Every domain call re-checks the case is the caller's (assigned) or the caller is an administrator. */
const flash = (kind: "ok" | "err", text: string) => putSessionData(flashValue(kind, text));
const s = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string): number => parseInt(s(fd, k), 10) || 0;

async function staff(here: string) {
  const me = await requireUser("counselor", "admin");
  await requireMfaIfStaff(me, here);
  return { me, who: { id: me.id, role: me.role as "counselor" | "admin" } };
}
const done = async (back: string, err: string | null, ok: string): Promise<never> => {
  await flash(err ? "err" : "ok", err ?? ok);
  redirect(back);
};

export async function moveAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#t${n(fd, "task_id")}`;
  const { who } = await staff(back);
  const to = s(fd, "to") as Status;
  const opts = { applicationId: n(fd, "application_id") || undefined, offer: s(fd, "offer_type") ? { type: s(fd, "offer_type"), conditions: s(fd, "offer_conditions"), deadline: s(fd, "offer_deadline"), deposit: s(fd, "offer_deposit") } : undefined };
  await done(back, await SV.moveTask(n(fd, "task_id"), who, to, s(fd, "note"), opts), "Task updated.");
}

export async function evidenceAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#t${n(fd, "task_id")}`;
  const { who } = await staff(back);
  const kind = s(fd, "kind") as "text" | "link" | "confirmation";
  await done(back, ["text", "link", "confirmation"].includes(kind) ? await SV.addNoteEvidence(n(fd, "task_id"), who, kind, s(fd, "value")) : "Unknown evidence type.", "Evidence added.");
}

export async function uploadAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#t${n(fd, "task_id")}`;
  const { who } = await staff(back);
  const f = fd.get("file");
  if (!(f instanceof File) || !DOC_KEYS[s(fd, "doc_key")]) return done(back, "Choose a file and a document type.", "");
  const r = await DC.upload(cid, who, { docKey: s(fd, "doc_key"), applicationId: n(fd, "application_id") || null, expiresOn: s(fd, "expires_on") || undefined, taskId: n(fd, "task_id") || null }, { name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
  await done(back, typeof r === "string" ? r : null, "Uploaded as a new version.");
}

export async function docReviewAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#docs`;
  const { who } = await staff(back);
  const ok = s(fd, "decision") === "verify";
  await done(back, await DC.review(n(fd, "doc_id"), who, ok, s(fd, "reason")), ok ? "Document verified." : "Document rejected and the student was notified.");
}

export async function naAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#t${n(fd, "task_id")}`;
  const { who } = await staff(back);
  const act = s(fd, "act");
  const err = act === "request" ? await SV.requestNa(n(fd, "task_id"), who, s(fd, "reason")) : await SV.decideNa(n(fd, "task_id"), who, act === "approve", s(fd, "reason"));
  await done(back, err, act === "request" ? "Requested. An administrator must approve it." : act === "approve" ? "Marked not applicable." : "Request declined.");
}

export async function assignAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  await done(`/counselor/journey/${cid}`, await WS.assign(cid, n(fd, "to") || null, who, s(fd, "reason")), "Case reassigned. The handover is on record.");
}

export async function claimAction(fd: FormData): Promise<void> {
  const { who } = await staff("/counselor/journey");
  await done("/counselor/journey", await WS.claim(n(fd, "case_id"), who), "Student added to your caseload.");
}

export async function commAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  await done(`/counselor/journey/${cid}#comms`, await WS.logComm(cid, who, { channel: s(fd, "channel"), direction: s(fd, "direction"), subject: s(fd, "subject"), body: s(fd, "body"), applicationId: n(fd, "application_id") || null }), "Logged.");
}

export async function reminderAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  if (s(fd, "act") === "done") {
    await WS.doneReminder(n(fd, "id"), who);
    redirect(`/counselor/journey/${cid}#comms`);
  }
  await done(`/counselor/journey/${cid}#comms`, await WS.addReminder(cid, who, s(fd, "remind_on"), s(fd, "body"), n(fd, "task_id") || null), "Reminder set.");
}

export async function exceptionAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const back = `/counselor/journey/${cid}#exceptions`;
  const { who } = await staff(back);
  const act = s(fd, "act");
  const detail = { newIntake: s(fd, "new_intake"), uniName: s(fd, "uni_name"), programme: s(fd, "programme"), category: s(fd, "category") };
  if (act === "apply") return done(back, await EX.apply(n(fd, "id"), who, s(fd, "note")), "Applied. History is kept and recovery steps were added where needed.");
  if (act === "decline") return done(back, await EX.decline(n(fd, "id"), who, s(fd, "note")), "Request declined and the student was told.");
  return done(back, await EX.recordNow(cid, who, s(fd, "kind") as EX.ExKind, s(fd, "reason"), detail, n(fd, "application_id") || undefined), "Recorded and applied.");
}

export async function addAppAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  const r = await AP.addApplication(cid, who, { uniName: s(fd, "uni_name"), programme: s(fd, "programme"), intake: s(fd, "intake"), category: s(fd, "category") });
  await done(`/counselor/journey/${cid}#apps`, typeof r === "string" ? r : null, "University added with its own checklist.");
}

export async function termsAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  await done(`/counselor/journey/${cid}#apps`, await AP.updateTerms(n(fd, "app_id"), who, { tuitionNote: s(fd, "tuition"), scholarshipNote: s(fd, "scholarship"), depositAmount: s(fd, "deposit"), offerDeadline: s(fd, "deadline") }), "Offer details saved.");
}

export async function carryOverAction(fd: FormData): Promise<void> {
  const cid = n(fd, "case_id");
  const { who } = await staff(`/counselor/journey/${cid}`);
  const r = await LG.carryOver(cid, who, n(fd, "upto"), s(fd, "note"));
  await done(`/counselor/journey/${cid}`, "error" in r ? r.error : null, "Carried over with your confirmation on each step.");
}
