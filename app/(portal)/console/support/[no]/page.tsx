import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsolePage, box, btnDark, btnLine, field } from "@/components/admin/console-page";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STAFF_STATUS_LABEL } from "@/lib/support/model";
import { staffGet } from "@/lib/support/store";
import { renderTemplate } from "@/lib/support/templates";
import { ACCEPT } from "@/lib/support/attachments";
import { Flash, PriorityBadge, StatusBadge, Thread, when } from "@/components/support/ui";
import { TemplatePicker } from "@/components/support/template-picker";
import { adminGate } from "../../gate";
import { assignStaffAction, deleteStaffAction, mergeStaffAction, priorityStaffAction, replyStaffAction, spamStaffAction, statusStaffAction } from "../actions";

export const metadata: Metadata = { title: "Support ticket | GrowQR admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StaffTicket({ params, searchParams }: { params: Promise<{ no: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { no: raw } = await params;
  const no = raw.toUpperCase();
  const me = await adminGate(`/console/support/${no}`);
  const sp = await searchParams;
  const data = await staffGet(no);
  if (!data) notFound();
  const { ticket: t, messages, events, history, staff, templates } = data;
  const tpl = templates.map((x) => ({ id: x.id, title: x.title, text: renderTemplate(x.body, { name: t.userName, order: t.relatedRef }) }));
  return (
    <ConsolePage me={me} tab="support" title={`${t.no}: ${t.subject}`} subtitle={`${t.categoryName} · opened ${when(t.createdAt)}`}>
      <p className="mb-4 flex flex-wrap gap-4 text-[14px]"><Link href="/console/support" className="underline">All tickets</Link><Link href={`/console/support/${t.no}/print`} className="underline" target="_blank">Print view (save as PDF)</Link></p>
      <Flash ok={sp.ok} err={sp.e} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={t.status} staff /><PriorityBadge priority={t.priority} />
        {t.rating ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-900">{t.rating}★ rated</span> : null}
        {t.isSpam ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[12px] font-semibold text-red-800">Spam (score {t.spamScore})</span> : null}
        {t.userId === null ? <span className="rounded-full bg-black/[0.07] px-2.5 py-1 text-[12px] font-semibold text-ink-3">Guest ticket</span> : null}
        {t.mergedInto ? <span className="rounded-full bg-black/[0.07] px-2.5 py-1 text-[12px] font-semibold text-ink-3">Merged into <Link className="underline" href={`/console/support/${t.mergedInto}`}>{t.mergedInto}</Link></span> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <Thread messages={messages} you="staff" />
          <section className={`${box} mt-5`} aria-label="Reply">
            <h2 className="mb-3 text-[17px] font-semibold text-ink">Reply</h2>
            <form action={replyStaffAction} encType="multipart/form-data" className="grid gap-3">
              <input type="hidden" name="no" value={t.no} />
              <TemplatePicker templates={tpl} targetId="body" className={field} />
              <label htmlFor="body" className="sr-only">Message</label>
              <textarea id="body" name="body" minLength={2} maxLength={8000} rows={6} placeholder="Write to the customer, or tick internal note to keep it between the team." className={`${field} min-h-[140px] w-full`} />
              <label className="text-[14px] text-ink-3">Attach files (JPG, PNG or PDF, up to 3, 10 MB each)<input name="attachments" type="file" multiple accept={ACCEPT} className={`${field} mt-1 block w-full py-2`} /></label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" name="internal" value="1" /> Internal note (the customer cannot see it)</label>
                <label className="flex items-center gap-2 text-[14px]">Then set status
                  <select name="status" defaultValue="" className={field}><option value="">Automatic</option>{STATUSES.map((s) => <option key={s} value={s}>{STAFF_STATUS_LABEL[s]}</option>)}</select>
                </label>
                <button type="submit" className={btnDark}>Send</button>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Ticket details">
          <section className={box}>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Customer</h2>
            <p className="text-[14.5px] text-ink">{t.userName}</p>
            <p className="break-all text-[13.5px] text-ink-3">{t.userEmail}</p>
            {t.phone ? <p className="text-[13.5px] text-ink-3">{t.phone}</p> : null}
            {t.relatedRef ? <p className="mt-2 text-[13.5px] text-ink-3">Reference: <b className="text-ink">{t.relatedRef}</b></p> : null}
            {t.ip || t.browser ? <p className="mt-2 break-words text-[12.5px] text-ink-4">{t.ip ? `IP ${t.ip}` : ""}{t.ip && t.browser ? " · " : ""}{t.browser ?? ""}</p> : null}
            {history.length ? <div className="mt-3"><p className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-4">Earlier tickets</p><ul className="mt-1 space-y-1 text-[13.5px]">{history.map((h) => <li key={h.no}><Link className="underline" href={`/console/support/${h.no}`}>{h.no}</Link> · {h.subject.slice(0, 40)}</li>)}</ul></div> : null}
          </section>
          <section className={box}>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Work on it</h2>
            <form action={statusStaffAction} className="mb-3 flex gap-2"><input type="hidden" name="no" value={t.no} /><select name="status" defaultValue={t.status} className={`${field} flex-1`} aria-label="Status">{STATUSES.map((s) => <option key={s} value={s}>{STAFF_STATUS_LABEL[s]}</option>)}</select><button className={btnLine} type="submit">Set</button></form>
            <form action={priorityStaffAction} className="mb-3 flex gap-2"><input type="hidden" name="no" value={t.no} /><select name="priority" defaultValue={t.priority} className={`${field} flex-1`} aria-label="Priority">{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select><button className={btnLine} type="submit">Set</button></form>
            <form action={assignStaffAction} className="mb-3 flex gap-2"><input type="hidden" name="no" value={t.no} /><select name="assigned_to" defaultValue={t.assignedTo ?? ""} className={`${field} flex-1`} aria-label="Assigned to"><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><button className={btnLine} type="submit">Assign</button></form>
            <form action={mergeStaffAction} className="flex gap-2"><input type="hidden" name="no" value={t.no} /><input name="merge_into" placeholder="Merge into SUP-2026-000123" aria-label="Ticket number to merge into" className={`${field} min-w-0 flex-1`} /><button className={btnLine} type="submit">Merge</button></form>
          </section>
          <section className={box}>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Spam</h2>
            <form action={spamStaffAction} className="mb-2"><input type="hidden" name="no" value={t.no} /><button type="submit" className={btnLine}>{t.isSpam ? "Not spam: move back to the inbox" : "Mark as spam"}</button></form>
            <form action={spamStaffAction}><input type="hidden" name="no" value={t.no} /><input type="hidden" name="block" value="1" /><button type="submit" className={btnLine}>Spam and block this sender</button></form>
            <p className="mt-2 text-[12.5px] text-ink-4">Blocking adds the email, its domain (unless a free mail provider) and the IP to the blocklist.</p>
          </section>
          <section className={box}>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Timeline</h2>
            <ol className="space-y-1.5 text-[13px] text-ink-3">{events.map((e, i) => <li key={i}><span className="text-ink-4">{when(e.createdAt)}</span> · <b className="text-ink-2">{e.actor}</b> {e.kind}{e.detail ? `: ${e.detail}` : ""}</li>)}</ol>
          </section>
          <section className={`${box} border-red-200`}>
            <h2 className="mb-2 text-[15px] font-semibold text-red-800">Delete this ticket</h2>
            <p className="mb-2 text-[13px] text-ink-3">Removes the ticket, its messages, files and history for good. Type <b>{t.no}</b> to confirm.</p>
            <form action={deleteStaffAction} className="flex gap-2"><input type="hidden" name="no" value={t.no} /><input name="confirm" autoComplete="off" aria-label="Type the ticket number to confirm" className={`${field} min-w-0 flex-1`} /><button type="submit" className="min-h-[44px] rounded-lg bg-red-700 px-4 text-[14px] font-semibold text-white">Delete</button></form>
          </section>
        </aside>
      </div>
    </ConsolePage>
  );
}
