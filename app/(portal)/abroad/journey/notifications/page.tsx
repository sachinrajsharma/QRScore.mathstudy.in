import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/portal/guard";
import * as NT from "@/lib/journey/notify";
import { JourneyFlash as Flash } from "@/components/journey/flash";
import { markReadAction, prefsAction } from "@/app/abroad/journey-actions";
import { btnGhost, btnPrimary, when } from "@/components/journey/parts";
import { Card, PortalPage } from "@/components/portal/shell";

export const metadata: Metadata = { title: "Notifications | GrowQR" };
export const dynamic = "force-dynamic";

export default async function JourneyNotifications() {
  const me = await requireUser("student");
  const [items, prefs] = await Promise.all([NT.list(me.id, 40), NT.prefs(me.id)]);
  return (
    <PortalPage user={me} active="abroad" title="Notifications" subtitle={<Link className="underline" href="/abroad/journey">← Back to your checklist</Link>} wide>
      <Flash />
      <Card title="Your reminders and updates">
        {!items.length ? <p className="text-[15px] text-ink-3">Nothing yet. Reminders appear here before deadlines, and we tell you when your consultant reviews something.</p> : (
          <>
            <form action={markReadAction} className="mb-3"><input type="hidden" name="back" value="/abroad/journey/notifications" /><button className={btnGhost} type="submit">Mark all as read</button></form>
            <ul className="divide-y divide-black/[0.07]">{items.map((n) => (
              <li key={String(n.id)} className="py-3"><p className={`text-[15px] ${n.read_at ? "text-ink-2" : "font-semibold text-ink"}`}>{!n.read_at ? <span className="mr-1.5 inline-block rounded bg-orange px-1.5 py-0.5 text-[11px] text-white" aria-label="Unread">New</span> : null}{String(n.title)}</p>
                {n.body ? <p className="text-[14px] text-ink-3">{String(n.body)}</p> : null}
                <p className="text-[12px] text-ink-4">{when(String(n.created_at))}{n.link ? <> · <Link className="underline" href={String(n.link)}>Open</Link></> : null}</p></li>))}</ul>
          </>)}
      </Card>
      <Card title="How we contact you">
        <form action={prefsAction} className="space-y-3">
          <label className="flex items-start gap-2.5 min-h-[44px] text-[15px]"><input type="checkbox" name="inapp" defaultChecked={prefs.inapp} className="mt-1 h-5 w-5 accent-orange" /><span>Show reminders in my journey</span></label>
          <label className="flex items-start gap-2.5 min-h-[44px] text-[15px]"><input type="checkbox" name="email" defaultChecked={prefs.email} className="mt-1 h-5 w-5 accent-orange" /><span>Also email me reminders and review results</span></label>
          <p className="text-[13px] text-ink-3">Even with these off, your deadlines stay visible on your journey page, and overdue critical steps still show in the app.</p>
          <button className={btnPrimary} type="submit">Save</button>
        </form>
      </Card>
    </PortalPage>
  );
}
