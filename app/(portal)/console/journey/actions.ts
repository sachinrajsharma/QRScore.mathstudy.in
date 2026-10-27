"use server";

import { redirect } from "next/navigation";
import { putSessionData } from "@/lib/portal/session";
import { flashValue } from "@/components/journey/flash";
import { diffTemplates, validateTemplate } from "@/lib/journey/template";
import { adminGate } from "../gate";
import * as NT from "@/lib/journey/notify";
import * as ST from "@/lib/journey/store";

/** Administrator actions for the journey: publish a new template version, change reminder and escalation rules, run the reminder sweep. */
const flash = (kind: "ok" | "err", text: string) => putSessionData(flashValue(kind, text));
const BACK = "/console/journey";
const s = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

export async function templateAction(fd: FormData): Promise<void> {
  const me = await adminGate(BACK);
  let parsed: unknown;
  try { parsed = JSON.parse(s(fd, "definition")); } catch { await flash("err", "That is not valid JSON."); redirect(BACK); }
  const v = validateTemplate(parsed);
  if (!v.ok) { await flash("err", "Not published: " + v.errors.slice(0, 5).join(" ")); redirect(BACK); }
  const cur = await ST.currentTemplate();
  if (v.template.key !== cur.key) { await flash("err", `The template key must stay “${cur.key}”.`); redirect(BACK); }
  const d = diffTemplates(cur.def, v.template, { destination: "uk", degree: "PG", intake: "Fall 2027", visaRoute: "student", englishExempt: false, entranceTestNeeded: false, needsFunding: true, needsLoan: true, wantsScholarship: true, needsAccommodation: true, hasWorkExperience: true, hasStudyGap: false, portfolioNeeded: false, wantsInternship: false, wantsPartTime: false });
  const summary = `+${d.add.length} −${d.remove.length} ~${d.changed.length} tasks for a typical UK Master's case`;
  if (s(fd, "act") === "check") { await flash("ok", `Valid. Compared with version ${cur.version}: ${summary}. Existing students keep the version they started on.`); redirect(BACK); }
  const note = s(fd, "note");
  if (note.length < 5) { await flash("err", "Add a short note describing what changed."); redirect(BACK); }
  const version = await ST.publishTemplate(v.template, me.id, note);
  await flash("ok", `Published as version ${version} (${summary}). It applies to new students only; existing cases are not changed.`);
  redirect(BACK);
}

export async function settingsAction(fd: FormData): Promise<void> {
  const me = await adminGate(BACK);
  const num = (k: string, lo: number, hi: number, d: number) => { const x = parseInt(s(fd, k), 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const days = s(fd, "reminder_days").split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x >= 0 && x <= 60);
  const cur = await ST.settings();
  await ST.saveSettings({
    reminderDays: days.length ? [...new Set(days)].sort((a, b) => b - a) : cur.reminderDays, consultantAfterDays: num("consultant_after", 1, 30, cur.consultantAfterDays), managerAfterDays: num("manager_after", 2, 60, cur.managerAfterDays),
    universityFollowupDays: num("uni_days", 2, 60, cur.universityFollowupDays), reviewSlaDays: num("review_sla", 1, 30, cur.reviewSlaDays), staleCaseDays: num("stale", 3, 90, cur.staleCaseDays),
  }, me.id);
  await flash("ok", "Reminder and escalation rules saved. They apply from the next sweep.");
  redirect(BACK);
}

export async function sweepAction(): Promise<void> {
  await adminGate(BACK);
  const r = await NT.runSweep();
  await flash("ok", `Sweep done: ${r.reminders} reminders, ${r.overdue} overdue alerts, ${r.escalations} escalations, ${r.universityFollowUps} university follow-ups, ${r.reviewSla} review alerts, ${r.docExpiry} expiry warnings, ${r.manual} personal reminders. Running it again creates nothing twice.`);
  redirect(BACK);
}
