import type { Metadata } from "next";
import Link from "next/link";
import { ConsolePage, Stats, box, btnDark, btnLine, field } from "@/components/admin/console-page";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STAFF_STATUS_LABEL } from "@/lib/support/model";
import { listCategories, staffList } from "@/lib/support/store";
import { PriorityBadge, StatusBadge, when } from "@/components/support/ui";
import { adminGate } from "../gate";

export const metadata: Metadata = { title: "Support tickets | GrowQR admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SupportInbox({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await adminGate("/console/support");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const spam = sp.spam === "1";
  const [{ tickets, total, pages, stats }, cats] = await Promise.all([
    staffList({ status: sp.status, priority: sp.priority, category: sp.category, q: sp.q, assigned: sp.assigned === "me" || sp.assigned === "none" ? sp.assigned : undefined, page, spam }, me.id),
    listCategories(),
  ]);
  const qs = (over: Record<string, string>): string => { const u = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]); return `/console/support?${u.toString()}`; };
  return (
    <ConsolePage me={me} tab="support" title={spam ? "Support: spam folder" : "Support tickets"} subtitle="Questions and problems raised by members and guests.">
      <Stats items={[["Open", stats.open], ["In progress", stats.pending], ["Waiting for customer", stats.waiting], ["Critical open", stats.critical], ["Resolved", stats.resolved], ["Closed", stats.closed], ["New today", stats.today], ["Average rating", stats.avgRating === null ? "none" : `${stats.avgRating}/5`], ["Average time to resolve", stats.avgResolutionHours === null ? "none" : `${stats.avgResolutionHours} h`]]} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-[14px]">
        <Link href="/console/support" className={`${btnLine} inline-flex items-center`} aria-current={!spam ? "page" : undefined}>Inbox</Link>
        <Link href="/console/support?spam=1" className={`${btnLine} inline-flex items-center`} aria-current={spam ? "page" : undefined}>Spam folder ({stats.spam})</Link>
        <a href="/console/support/export" className={`${btnLine} inline-flex items-center`}>Export CSV</a>
        <Link href="/console/support/settings" className={`${btnLine} inline-flex items-center`}>Categories, templates and blocked senders</Link>
      </div>
      <form method="GET" className={`${box} flex flex-wrap items-end gap-3`} role="search">
        {spam ? <input type="hidden" name="spam" value="1" /> : null}
        <label className="grid gap-1 text-[13px] text-ink-3">Status<select name="status" defaultValue={sp.status ?? ""} className={field}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STAFF_STATUS_LABEL[s]}</option>)}</select></label>
        <label className="grid gap-1 text-[13px] text-ink-3">Priority<select name="priority" defaultValue={sp.priority ?? ""} className={field}><option value="">All</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        <label className="grid gap-1 text-[13px] text-ink-3">Category<select name="category" defaultValue={sp.category ?? ""} className={field}><option value="">All</option>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.active ? "" : " (off)"}</option>)}</select></label>
        <label className="grid gap-1 text-[13px] text-ink-3">Assigned<select name="assigned" defaultValue={sp.assigned ?? ""} className={field}><option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option></select></label>
        <label className="grid min-w-[200px] flex-1 gap-1 text-[13px] text-ink-3">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Number, subject, name, email, reference" className={field} /></label>
        <button type="submit" className={btnDark}>Filter</button>
        <Link href={spam ? "/console/support?spam=1" : "/console/support"} className={btnLine + " inline-flex items-center"}>Reset</Link>
      </form>
      <div className={`${box} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead className="text-ink-3"><tr><th className="py-2 pr-3">Ticket</th><th className="pr-3">Customer</th><th className="pr-3">Category</th><th className="pr-3">Priority</th><th className="pr-3">Status</th><th className="pr-3">Assigned</th><th>Last activity</th></tr></thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.no} className="border-t border-black/[0.07] align-top">
                <td className="py-2.5 pr-3"><Link href={`/console/support/${t.no}`} className="font-semibold text-ink underline-offset-2 hover:underline">{t.no}</Link>{t.unread ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${t.unread} unread`}>{t.unread}</span> : null}{t.userId === null ? <span className="ml-1.5 rounded-full bg-black/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">guest</span> : null}<div className="max-w-[320px] break-words text-ink-2">{t.subject}</div></td>
                <td className="pr-3">{t.userName}<div className="text-[12.5px] text-ink-4 break-all">{t.userEmail}</div></td>
                <td className="pr-3">{t.categoryName}</td>
                <td className="pr-3"><PriorityBadge priority={t.priority} /></td>
                <td className="pr-3"><StatusBadge status={t.status} staff /></td>
                <td className="pr-3">{t.assignedName ?? "Unassigned"}</td>
                <td className="whitespace-nowrap">{when(t.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tickets.length ? <p className="py-6 text-center text-ink-3">No tickets match.</p> : null}
        <div className="mt-3 flex items-center justify-between text-[13.5px] text-ink-3">
          <span>{total} ticket{total === 1 ? "" : "s"}</span>
          <span className="flex gap-3">{page > 1 ? <Link className="underline" href={qs({ page: String(page - 1) })}>Previous</Link> : null}<span>Page {page} of {pages}</span>{page < pages ? <Link className="underline" href={qs({ page: String(page + 1) })}>Next</Link> : null}</span>
        </div>
      </div>
    </ConsolePage>
  );
}
