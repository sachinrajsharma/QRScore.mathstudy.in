import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supportUser } from "@/lib/support/page";
import { Card, PortalPage } from "@/components/portal/shell";
import { canRate, canUserReply } from "@/lib/support/model";
import { getForUser } from "@/lib/support/store";
import { ACCEPT } from "@/lib/support/attachments";
import { Flash, StatusBadge, Thread, btnPrimary, inputCls, when } from "@/components/support/ui";
import { rateAction, replyAction } from "../../actions";
import { captchaMode, turnstileSiteKey } from "@/lib/portal/captcha";
import { CheckedSubmit } from "@/components/support/checked-submit";

export const metadata: Metadata = { title: "Support ticket | GrowQR" };
export const dynamic = "force-dynamic";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await supportUser("/support/tickets");
  const { no } = await params;
  const sp = await searchParams;
  const mode = captchaMode();
  const captcha = { mode, siteKey: mode === "turnstile" ? turnstileSiteKey() : "" };
  const data = await getForUser(me.id, no.toUpperCase()); // only the owner gets a ticket back; anyone else sees a 404
  if (!data) notFound();
  const { ticket: t, messages } = data;
  return (
    <PortalPage user={me} active="support" title={t.subject} subtitle={`${t.no} · ${t.categoryName}`} wide>
      <p className="mb-4 text-[14px]"><Link href="/support/tickets" className="underline">All my tickets</Link></p>
      {sp.new ? <Flash ok="Your ticket is open. We emailed you a copy, and we will reply here." /> : null}
      {sp.sent ? <Flash ok="Your reply was sent." /> : null}
      <Flash ok={sp.ok} err={sp.e} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-[14px] text-ink-3">
        <StatusBadge status={t.status} />
        <span>Opened {when(t.createdAt)}</span>
        {t.relatedRef ? <span>Reference: <b className="text-ink">{t.relatedRef}</b></span> : null}
      </div>

      <Thread messages={messages} you="person" />
      <span id="latest" />

      {canRate(t.status, t.rating) ? (
        <Card title="How did we do?" className="mt-5">
          <form action={rateAction} className="grid gap-3">
            <input type="hidden" name="no" value={t.no} />
            <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Rating from 1 to 5</legend>
              {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-black/[0.15] px-3 text-[15px]"><input type="radio" name="rating" value={n} required /> {n} ★</label>)}
            </fieldset>
            <label htmlFor="comment" className="sr-only">Comment (optional)</label>
            <input id="comment" name="comment" maxLength={500} placeholder="Anything to add? (optional)" className={inputCls} />
            <div><button type="submit" className={btnPrimary}>Send rating</button></div>
          </form>
        </Card>
      ) : t.rating ? <p className="mt-5 text-[14.5px] text-ink-3">You rated this ticket {t.rating} out of 5. Thank you.</p> : null}

      {canUserReply(t.status) ? (
        <Card title={t.status === "resolved" ? "Still need help? Reply to reopen" : "Reply"} className="mt-5">
          <form action={replyAction} encType="multipart/form-data" className="grid gap-3">
            <input type="hidden" name="no" value={t.no} />
            <label htmlFor="body" className="sr-only">Your reply</label>
            <textarea id="body" name="body" minLength={2} maxLength={8000} rows={5} placeholder="Type your reply" className={`${inputCls} min-h-[130px]`} />
            <label htmlFor="attachments" className="text-[14px] text-ink-3">Attach files (JPG, PNG or PDF, up to 3, 10 MB each)</label>
            <input id="attachments" name="attachments" type="file" multiple accept={ACCEPT} className={`${inputCls} py-2`} />
            <CheckedSubmit captcha={captcha} label="Send reply" className={btnPrimary} />
          </form>
        </Card>
      ) : (
        <Card className="mt-5"><p className="text-[15px] text-ink-2">This ticket is closed. If you still need help, <Link href="/support/new" className="underline">raise a new ticket</Link>.</p></Card>
      )}
    </PortalPage>
  );
}
