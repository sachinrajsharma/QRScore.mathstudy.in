import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketShell, currentViewer } from "@/components/market/shell";
import { canRate, canUserReply, isAccessToken } from "@/lib/support/model";
import { getByToken } from "@/lib/support/store";
import { ACCEPT } from "@/lib/support/attachments";
import { Flash, StatusBadge, Thread, btnPrimary, inputCls, when } from "@/components/support/ui";
import { captchaMode, turnstileSiteKey } from "@/lib/portal/captcha";
import { CheckedSubmit } from "@/components/support/checked-submit";
import { guestRateAction, guestReplyAction } from "../../actions";

export const dynamic = "force-dynamic";
// A private link: never indexed, and the address is not passed on to other sites.
export const metadata: Metadata = { title: "Your support ticket | GrowQR", robots: { index: false, follow: false }, referrer: "no-referrer" };

const card = "mt-5 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card";

export default async function GuestTicket({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  if (!isAccessToken(token)) notFound();
  const data = await getByToken(token);
  if (!data) notFound();
  const sp = await searchParams;
  const me = await currentViewer();
  const mode = captchaMode();
  const captcha = { mode, siteKey: mode === "turnstile" ? turnstileSiteKey() : "" };
  const { ticket: t, messages } = data;
  return (
    <MarketShell user={me} active="">
      <header className="max-w-3xl">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-orange-deep">{t.no} · {t.categoryName}</p>
        <h1 className="mt-1 text-[clamp(1.6rem,4vw,2.3rem)] font-bold leading-tight text-ink">{t.subject}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[14px] text-ink-3"><StatusBadge status={t.status} /><span>Opened {when(t.createdAt)}</span>{t.relatedRef ? <span>Reference: <b className="text-ink">{t.relatedRef}</b></span> : null}</div>
        <p className="mt-3 text-[14px] text-ink-3">Keep this page&apos;s address: it is the only way back to your ticket. We also emailed it to {t.userEmail}.</p>
      </header>
      <div className="mt-5 max-w-3xl">
        {sp.new ? <Flash ok="Your ticket is open. We emailed you a copy, and we will reply here and by email." /> : null}
        {sp.sent ? <Flash ok="Your reply was sent." /> : null}
        <Flash ok={sp.ok} err={sp.e} />
        <Thread messages={messages} you="person" attachmentHref={(a) => `/support/attachment/${a.id}?t=${token}`} />
        <span id="latest" />

        {canRate(t.status, t.rating) ? (
          <section className={card} aria-label="Rate our help">
            <h2 className="text-[17px] font-semibold text-ink">How did we do?</h2>
            <form action={guestRateAction} className="mt-3 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Rating from 1 to 5</legend>
                {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-black/[0.15] px-3 text-[15px]"><input type="radio" name="rating" value={n} required /> {n} ★</label>)}
              </fieldset>
              <label htmlFor="comment" className="sr-only">Comment (optional)</label>
              <input id="comment" name="comment" maxLength={500} placeholder="Anything to add? (optional)" className={inputCls} />
              <div><button type="submit" className={btnPrimary}>Send rating</button></div>
            </form>
          </section>
        ) : t.rating ? <p className="mt-5 text-[14.5px] text-ink-3">You rated this ticket {t.rating} out of 5. Thank you.</p> : null}

        {canUserReply(t.status) ? (
          <section className={card} aria-label="Reply">
            <h2 className="text-[17px] font-semibold text-ink">{t.status === "resolved" ? "Still need help? Reply to reopen" : "Reply"}</h2>
            <form action={guestReplyAction} encType="multipart/form-data" className="mt-3 grid gap-3">
              <input type="hidden" name="token" value={token} />
              <label htmlFor="body" className="sr-only">Your reply</label>
              <textarea id="body" name="body" minLength={2} maxLength={8000} rows={5} placeholder="Type your reply" className={`${inputCls} min-h-[130px]`} />
              <label htmlFor="attachments" className="text-[14px] text-ink-3">Attach files (JPG, PNG or PDF, up to 3, 10 MB each)</label>
              <input id="attachments" name="attachments" type="file" multiple accept={ACCEPT} className={`${inputCls} py-2`} />
              <CheckedSubmit captcha={captcha} label="Send reply" className={btnPrimary} />
            </form>
          </section>
        ) : (
          <section className={card}><p className="text-[15px] text-ink-2">This ticket is closed and cannot be replied to. If you still need help, <Link href="/support" className="underline">raise a new ticket</Link>.</p></section>
        )}
      </div>
    </MarketShell>
  );
}
