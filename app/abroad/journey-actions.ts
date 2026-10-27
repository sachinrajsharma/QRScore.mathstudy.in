"use server";

import { redirect } from "next/navigation";
import { isVerified } from "@/lib/portal/auth";
import { currentUser } from "@/lib/portal/guard";
import { putSessionData } from "@/lib/portal/session";
import { flashValue } from "@/components/journey/flash";
import * as AP from "@/lib/journey/apps";
import * as DC from "@/lib/journey/docs";
import * as EX from "@/lib/journey/exceptions";
import * as LG from "@/lib/journey/legacy";
import * as NT from "@/lib/journey/notify";
import * as SV from "@/lib/journey/service";
import * as ST from "@/lib/journey/store";
import { DOC_KEYS, type Status } from "@/lib/journey/types";

/** Student Server Actions for the journey. Each re-checks the caller is a signed-in student and every domain call re-checks they own the case. */
const flash = (kind: "ok" | "err", text: string) => putSessionData(flashValue(kind, text));
const s = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string): number => parseInt(s(fd, k), 10) || 0;
const BASE = "/abroad/journey";

async function student(back = BASE) {
  const me = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (me.role !== "student") redirect(back);
  if (!isVerified(me)) {
    await flash("err", "Please confirm your email address first.");
    redirect(back);
  }
  return { me, who: { id: me.id, role: "student" as const } };
}

export async function startJourneyAction(fd: FormData): Promise<void> {
  const { me, who } = await student();
  const destination = s(fd, "destination");
  const degree = s(fd, "degree");
  if (!["usa", "uk", "canada", "germany", "australia", "france", "uae"].includes(destination) || !["UG", "PG", "PhD"].includes(degree) || !s(fd, "intake")) {
    await flash("err", "Choose a destination, a degree level and an intake.");
    redirect(BASE);
  }
  const b = (k: string) => fd.get(k) === "on";
  try {
    await LG.startJourney(me.id, {
      destination, degree: degree as "UG" | "PG" | "PhD", intake: s(fd, "intake").slice(0, 30), visaRoute: "student", englishExempt: b("englishExempt"), entranceTestNeeded: b("entranceTestNeeded"), needsFunding: b("needsLoan") || b("needsFunding"),
      needsLoan: b("needsLoan"), wantsScholarship: b("wantsScholarship"), needsAccommodation: b("needsAccommodation"), hasWorkExperience: b("hasWorkExperience"), hasStudyGap: b("hasStudyGap"), portfolioNeeded: b("portfolioNeeded"),
      wantsInternship: b("wantsInternship"), wantsPartTime: b("wantsPartTime"),
    }, who);
    await flash("ok", "Your journey is ready. Start with the next actions below.");
  } catch (e) {
    await flash("err", (e as Error).message.includes("already") ? "You already have a journey." : "We could not start your journey. Please try again.");
  }
  redirect(BASE);
}

/** Move a task: start, submit for review, complete, or mark waiting on a third party. */
export async function taskMoveAction(fd: FormData): Promise<void> {
  const id = n(fd, "task_id");
  const back = `${BASE}/task/${id}`;
  const { who } = await student(back);
  const to = s(fd, "to") as Status;
  const err = await SV.moveTask(id, who, to, s(fd, "note"), { applicationId: n(fd, "application_id") || undefined });
  await flash(err ? "err" : "ok", err ?? (to === "submitted_for_review" ? "Sent to your consultant for review." : to === "completed" ? "Done. Thank you." : "Updated."));
  redirect(back);
}

export async function evidenceAction(fd: FormData): Promise<void> {
  const id = n(fd, "task_id");
  const back = `${BASE}/task/${id}`;
  const { who } = await student(back);
  const kind = s(fd, "kind") as "text" | "link" | "confirmation";
  const err = ["text", "link", "confirmation"].includes(kind) ? await SV.addNoteEvidence(id, who, kind, s(fd, "value")) : "Unknown evidence type.";
  await flash(err ? "err" : "ok", err ?? "Added.");
  redirect(back);
}

export async function attachDocAction(fd: FormData): Promise<void> {
  const id = n(fd, "task_id");
  const back = `${BASE}/task/${id}`;
  const { who } = await student(back);
  const err = await SV.attachExistingDoc(id, n(fd, "doc_id"), who);
  await flash(err ? "err" : "ok", err ?? "Attached.");
  redirect(back);
}

export async function uploadAction(fd: FormData): Promise<void> {
  const back = s(fd, "back").startsWith(BASE) ? s(fd, "back") : `${BASE}/documents`;
  const { me, who } = await student(back);
  const c = await ST.caseOfUser(me.id);
  const f = fd.get("file");
  if (!c || !(f instanceof File)) {
    await flash("err", "Choose a file to upload.");
    redirect(back);
  }
  const key = s(fd, "doc_key");
  if (!DOC_KEYS[key]) {
    await flash("err", "Choose a document type.");
    redirect(back);
  }
  const r = await DC.upload(c.id, who, { docKey: key, applicationId: n(fd, "application_id") || null, expiresOn: s(fd, "expires_on") || undefined, taskId: n(fd, "task_id") || null }, { name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
  await flash(typeof r === "string" ? "err" : "ok", typeof r === "string" ? r : "Uploaded as a new version. Your consultant will check it.");
  redirect(back);
}

export async function requestNaAction(fd: FormData): Promise<void> {
  const id = n(fd, "task_id");
  const back = `${BASE}/task/${id}`;
  const { who } = await student(back);
  const err = await SV.requestNa(id, who, s(fd, "reason"));
  await flash(err ? "err" : "ok", err ?? "Sent to your consultant for approval. The step stays open until they approve.");
  redirect(back);
}

export async function addApplicationAction(fd: FormData): Promise<void> {
  const { me, who } = await student(`${BASE}/applications`);
  const c = await ST.caseOfUser(me.id);
  if (!c) redirect(BASE);
  const r = await AP.addApplication(c.id, who, { uniName: s(fd, "uni_name"), programme: s(fd, "programme"), intake: s(fd, "intake"), category: s(fd, "category") });
  await flash(typeof r === "string" ? "err" : "ok", typeof r === "string" ? r : "Added to your shortlist. Your consultant will review it with you.");
  redirect(`${BASE}/applications`);
}

export async function exceptionRequestAction(fd: FormData): Promise<void> {
  const { me, who } = await student(BASE);
  const c = await ST.caseOfUser(me.id);
  if (!c) redirect(BASE);
  const kind = s(fd, "kind") as EX.ExKind;
  const r = await EX.request(c.id, who, kind, s(fd, "reason"), { newIntake: s(fd, "new_intake"), uniName: s(fd, "uni_name"), programme: s(fd, "programme") }, n(fd, "application_id") || undefined);
  await flash(typeof r === "string" ? "err" : "ok", typeof r === "string" ? r : "Sent to your consultant. They will confirm what changes.");
  redirect(`${BASE}/applications#changes`);
}

export async function prefsAction(fd: FormData): Promise<void> {
  const { me } = await student(`${BASE}/notifications`);
  await NT.setPrefs(me.id, fd.get("email") === "on", fd.get("inapp") === "on");
  await flash("ok", "Notification settings saved.");
  redirect(`${BASE}/notifications`);
}

export async function markReadAction(fd: FormData): Promise<void> {
  const { me } = await student(`${BASE}/notifications`);
  await NT.markRead(me.id, n(fd, "id") || undefined);
  redirect(s(fd, "back").startsWith(BASE) ? s(fd, "back") : `${BASE}/notifications`);
}
