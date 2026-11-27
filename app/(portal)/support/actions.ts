"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/portal/guard";
import { newTicketSchema, ratingSchema, replySchema, isTicketNo } from "@/lib/support/model";
import { createTicket, rate, replyAsUser } from "@/lib/support/store";
import { humanCheck } from "@/lib/portal/captcha";
import { requestCtx, text } from "@/lib/support/request";

/** The person's side of support. Every action starts from the signed-in account: a ticket can only be raised, read or answered by its owner. */
async function me() {
  const u = await currentUser();
  if (!u) redirect("/login?next=" + encodeURIComponent("/support/new"));
  return { id: u.id, name: u.name, email: u.email };
}
const back = (path: string, key: "e" | "ok", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

export async function newTicketAction(fd: FormData): Promise<void> {
  const user = await me();
  if (!(await humanCheck(fd, "support-new"))) return back("/support/new", "e", "The security check was not right. Please try again with the new code.");
  const parsed = newTicketSchema.safeParse({ category: text(fd, "category"), subject: text(fd, "subject"), related_ref: text(fd, "related_ref"), body: text(fd, "body") });
  if (!parsed.success) return back("/support/new", "e", parsed.error.issues[0]?.message ?? "Please check the form.");
  const req = await requestCtx(fd);
  if (!req.ok) return back("/support/new", "e", req.error);
  const r = await createTicket(user, parsed.data, req.ctx);
  if (!r.ok) return back("/support/new", "e", r.error);
  if (r.dropped) redirect(`/support/thanks?no=${r.no}`);
  redirect(`/support/tickets/${r.no}?${r.duplicate ? "ok=" + encodeURIComponent("You already sent this ticket, so we opened it for you.") : "new=1"}`);
}

export async function replyAction(fd: FormData): Promise<void> {
  const user = await me();
  const no = text(fd, "no");
  if (!isTicketNo(no)) redirect("/support/tickets");
  const path = `/support/tickets/${no}`;
  if (!(await humanCheck(fd, "support-reply"))) return back(path, "e", "The security check was not right. Please try again with the new code.");
  const req = await requestCtx(fd);
  if (!req.ok) return back(path, "e", req.error);
  const parsed = replySchema.safeParse({ body: text(fd, "body") || (req.ctx.files?.length ? "(attachment)" : "") });
  if (!parsed.success) return back(path, "e", parsed.error.issues[0]?.message ?? "Write your reply.");
  const r = await replyAsUser(user, no, parsed.data.body, req.ctx.files);
  if (!r.ok) return back(path, "e", r.error);
  redirect(`${path}?sent=1#latest`);
}

export async function rateAction(fd: FormData): Promise<void> {
  const user = await me();
  const no = text(fd, "no");
  if (!isTicketNo(no)) redirect("/support/tickets");
  const path = `/support/tickets/${no}`;
  const parsed = ratingSchema.safeParse({ rating: text(fd, "rating"), comment: text(fd, "comment") });
  if (!parsed.success) back(path, "e", "Choose a rating from 1 to 5.");
  else {
    const r = await rate(user, no, parsed.data.rating, parsed.data.comment);
    back(path, r.ok ? "ok" : "e", r.ok ? "Thank you for the feedback." : r.error);
  }
}
