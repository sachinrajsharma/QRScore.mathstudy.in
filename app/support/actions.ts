"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/portal/guard";
import { guestTicketSchema, isAccessToken, newTicketSchema, ratingSchema, replySchema } from "@/lib/support/model";
import { createGuestTicket, createTicket, rateByToken, replyByToken } from "@/lib/support/store";
import { humanCheck } from "@/lib/portal/captcha";
import { requestCtx, text } from "@/lib/support/request";

/** The public side of support: anyone can raise a ticket (a signed-in member's goes on their account), and a guest follows it through its private link. */
const back = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}e=${encodeURIComponent(msg)}`);

export async function publicTicketAction(fd: FormData): Promise<void> {
  if (!(await humanCheck(fd, "support-public"))) return back("/support", "The security check was not right. Please try again with the new code.");
  const me = await currentUser();
  const base = { category: text(fd, "category"), subject: text(fd, "subject"), related_ref: text(fd, "related_ref"), body: text(fd, "body") };
  const req = await requestCtx(fd);
  if (!req.ok) return back("/support", req.error);
  if (me) {
    const p = newTicketSchema.safeParse(base);
    if (!p.success) return back("/support", p.error.issues[0]?.message ?? "Please check the form.");
    const r = await createTicket({ id: me.id, name: me.name, email: me.email }, p.data, req.ctx);
    if (!r.ok) return back("/support", r.error);
    if (r.dropped) redirect(`/support/thanks?no=${r.no}`);
    redirect(`/support/tickets/${r.no}?${r.duplicate ? "ok=" + encodeURIComponent("You already sent this ticket, so we opened it for you.") : "new=1"}`);
  }
  const p = guestTicketSchema.safeParse({ ...base, name: text(fd, "name"), email: text(fd, "email"), phone: text(fd, "phone") });
  if (!p.success) return back("/support", p.error.issues[0]?.message ?? "Please check the form.");
  const r = await createGuestTicket(p.data, req.ctx);
  if (!r.ok) return back("/support", r.error);
  // A new ticket goes to its private link. A repeat or a dropped one gets the same plain confirmation, and the link is only ever emailed.
  if (r.token && !r.duplicate && !r.dropped) redirect(`/support/ticket/${r.token}?new=1`);
  redirect(`/support/thanks?no=${r.no}${r.duplicate ? "&again=1" : ""}`);
}

export async function guestReplyAction(fd: FormData): Promise<void> {
  const token = text(fd, "token");
  if (!isAccessToken(token)) redirect("/support");
  const path = `/support/ticket/${token}`;
  if (!(await humanCheck(fd, "support-guest-reply"))) return back(path, "The security check was not right. Please try again with the new code.");
  const req = await requestCtx(fd);
  if (!req.ok) return back(path, req.error);
  const p = replySchema.safeParse({ body: text(fd, "body") || (req.ctx.files?.length ? "(attachment)" : "") });
  if (!p.success) return back(path, p.error.issues[0]?.message ?? "Write your reply.");
  const r = await replyByToken(token, p.data.body, req.ctx.files);
  if (!r.ok) return back(path, r.error);
  redirect(`${path}?sent=1#latest`);
}

export async function guestRateAction(fd: FormData): Promise<void> {
  const token = text(fd, "token");
  if (!isAccessToken(token)) redirect("/support");
  const path = `/support/ticket/${token}`;
  const p = ratingSchema.safeParse({ rating: text(fd, "rating"), comment: text(fd, "comment") });
  if (!p.success) return back(path, "Choose a rating from 1 to 5.");
  const r = await rateByToken(token, p.data.rating, p.data.comment);
  if (!r.ok) return back(path, r.error);
  redirect(`${path}?ok=${encodeURIComponent("Thank you for the feedback.")}`);
}
