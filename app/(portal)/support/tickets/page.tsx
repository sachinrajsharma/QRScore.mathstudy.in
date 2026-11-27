import type { Metadata } from "next";
import Link from "next/link";
import { supportUser } from "@/lib/support/page";
import { Card, PortalPage } from "@/components/portal/shell";
import { listForUser } from "@/lib/support/store";
import { StatusBadge, btnPrimary, inputCls, when } from "@/components/support/ui";

export const metadata: Metadata = { title: "My support tickets | GrowQR" };
export const dynamic = "force-dynamic";

export default async function MyTickets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await supportUser("/support/tickets");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const tickets = await listForUser(me.id, q);
  return (
    <PortalPage user={me} active="support" title="My support tickets" subtitle="Everything you have asked us, and our replies." wide>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/support/new" className={btnPrimary}>Raise a new ticket</Link>
        <form method="GET" className="flex flex-1 min-w-[220px] gap-2" role="search">
          <label htmlFor="q" className="sr-only">Search my tickets</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search by ticket number or subject" className={inputCls} />
          <button className="min-h-[48px] rounded-lg border border-black/[0.15] bg-white px-4 text-[14.5px] font-semibold hover:bg-cream-2" type="submit">Search</button>
        </form>
      </div>
      {tickets.length ? (
        <Card>
          <ul className="divide-y divide-black/[0.07]">
            {tickets.map((t) => (
              <li key={t.no} className="py-4">
                <Link href={`/support/tickets/${t.no}`} className="flex flex-wrap items-start justify-between gap-3 hover:opacity-90">
                  <span className="min-w-0">
                    <span className="block text-[16px] font-semibold text-ink break-words">{t.subject}{t.unread ? <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[11.5px] font-bold text-white" aria-label={`${t.unread} unread ${t.unread === 1 ? "reply" : "replies"}`}>{t.unread} new</span> : null}</span>
                    <span className="block text-[13.5px] text-ink-3">{t.no} · {t.categoryName} · updated {when(t.updatedAt)}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-[15px] text-ink-2">{q ? "No tickets match that search." : "You have not raised a ticket yet."}</p>
          {!q ? <p className="mt-1 text-[14px] text-ink-3">If something is not working or you have a question, we are here to help.</p> : null}
        </Card>
      )}
    </PortalPage>
  );
}
