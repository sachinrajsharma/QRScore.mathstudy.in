"use server";

import { redirect } from "next/navigation";
import { adminGate } from "../gate";
import { isTicketNo, replySchema } from "@/lib/support/model";
import { addCategory, addTemplate, staffAssign, staffDelete, staffMerge, staffReply, staffSetPriority, staffSetStatus, staffSpamBlock, staffToggleSpam, toggleCategory, toggleTemplate, unblock } from "@/lib/support/store";
import { collectUploads } from "@/lib/support/uploads";

/** The team's side of support. Every action re-checks that the caller is a signed-in administrator with two-step login on. */
const text = (fd: FormData, k: string): string => (typeof fd.get(k) === "string" ? String(fd.get(k)) : "");
const go = (no: string, key: "e" | "ok", msg: string): never => redirect(`/console/support/${no}?${key}=${encodeURIComponent(msg)}`);
const goSettings = (key: "e" | "ok", msg: string): never => redirect(`/console/support/settings?${key}=${encodeURIComponent(msg)}`);

async function staff(no: string) {
  if (!isTicketNo(no)) redirect("/console/support");
  const me = await adminGate(`/console/support/${no}`);
  return { id: me.id, name: me.name, email: me.email };
}

export async function replyStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const up = await collectUploads(fd);
  if (!up.ok) return go(no, "e", up.error);
  const parsed = replySchema.safeParse({ body: text(fd, "body") || (up.files.length ? "(attachment)" : "") });
  if (!parsed.success) return go(no, "e", parsed.error.issues[0]?.message ?? "Write a reply.");
  const internal = text(fd, "internal") === "1";
  const r = await staffReply(me, no, parsed.data.body, internal, text(fd, "status") || undefined, up.files);
  go(no, r.ok ? "ok" : "e", r.ok ? (internal ? "Internal note added." : "Reply sent to the customer.") : r.error);
}

export async function statusStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const r = await staffSetStatus(me, no, text(fd, "status"));
  go(no, r.ok ? "ok" : "e", r.ok ? "Status updated." : r.error);
}

export async function priorityStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const r = await staffSetPriority(me, no, text(fd, "priority"));
  go(no, r.ok ? "ok" : "e", r.ok ? "Priority updated." : r.error);
}

export async function assignStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const id = Number(text(fd, "assigned_to"));
  const r = await staffAssign(me, no, Number.isInteger(id) && id > 0 ? id : null);
  go(no, r.ok ? "ok" : "e", r.ok ? "Assignment updated." : r.error);
}

export async function mergeStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const r = await staffMerge(me, no, text(fd, "merge_into"));
  if (!r.ok) return go(no, "e", r.error);
  go(r.target, "ok", `${no} was merged into this ticket and closed.`);
}

export async function spamStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  const r = text(fd, "block") === "1" ? await staffSpamBlock(me, no) : await staffToggleSpam(me, no);
  go(no, r.ok ? "ok" : "e", r.ok ? (text(fd, "block") === "1" ? "Marked as spam and the sender is blocked." : "Spam flag changed.") : r.error);
}

export async function deleteStaffAction(fd: FormData): Promise<void> {
  const no = text(fd, "no");
  const me = await staff(no);
  if (text(fd, "confirm") !== no) return go(no, "e", `To delete, type the ticket number (${no}) in the box.`);
  const r = await staffDelete(me, no);
  if (!r.ok) return go(no, "e", r.error);
  redirect("/console/support");
}

async function settingsGate(): Promise<void> { await adminGate("/console/support/settings"); }

export async function categoryAction(fd: FormData): Promise<void> {
  await settingsGate();
  const toggle = Number(text(fd, "toggle_id"));
  if (Number.isInteger(toggle) && toggle > 0) { await toggleCategory(toggle); return goSettings("ok", "Category updated."); }
  const r = await addCategory(text(fd, "name"), text(fd, "default_priority"));
  goSettings(r.ok ? "ok" : "e", r.ok ? "Category saved." : r.error);
}

export async function templateAction(fd: FormData): Promise<void> {
  await settingsGate();
  const toggle = Number(text(fd, "toggle_id"));
  if (Number.isInteger(toggle) && toggle > 0) { await toggleTemplate(toggle); return goSettings("ok", "Template updated."); }
  const r = await addTemplate(text(fd, "title"), text(fd, "body"));
  goSettings(r.ok ? "ok" : "e", r.ok ? "Template saved." : r.error);
}

export async function unblockAction(fd: FormData): Promise<void> {
  await settingsGate();
  const id = Number(text(fd, "id"));
  if (Number.isInteger(id) && id > 0) await unblock(id);
  goSettings("ok", "Sender unblocked.");
}
