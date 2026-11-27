import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, MessageSquare, ShieldCheck } from "lucide-react";
import { MarketShell, currentViewer } from "@/components/market/shell";
import { SITE_URL } from "@/lib/seo";
import { CATEGORIES, LIMITS } from "@/lib/support/model";
import { listCategories } from "@/lib/support/store";
import { KNOWLEDGE_BASE } from "@/lib/support/kb";
import { ACCEPT } from "@/lib/support/attachments";
import { captchaMode, turnstileSiteKey } from "@/lib/portal/captcha";
import { TicketForm } from "@/components/support/ticket-form";
import { Flash } from "@/components/support/ui";
import { publicTicketAction } from "./actions";

export const dynamic = "force-dynamic";

const TITLE = "GrowQR Support: raise a ticket and track the reply";
const DESC = "Get help with your GrowQR account, payments, courses, internships or study abroad. Raise a ticket with or without an account and follow the conversation with our team.";
export const metadata: Metadata = { title: TITLE, description: DESC, alternates: { canonical: `${SITE_URL}/support` }, openGraph: { type: "website", url: `${SITE_URL}/support`, siteName: "GrowQR", title: TITLE, description: DESC } };

const HELP: Array<[string, string]> = [
  ["How fast will you reply?", "Most tickets get a first reply within one working day. Urgent payment and login problems are looked at first."],
  ["Can I add to a ticket later?", "Yes. Reply on the ticket at any time, and attach files. A resolved ticket reopens when you reply; a closed one needs a new ticket."],
  ["I do not have an account. Can I still ask?", "Yes. Fill in the form below. We email you a private link to your ticket, so keep that email."],
];

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await currentViewer();
  const sp = await searchParams;
  const mode = captchaMode();
  const captcha = { mode, siteKey: mode === "turnstile" ? turnstileSiteKey() : "" };
  const cats = (await listCategories(true).catch(() => [])).map((c) => ({ slug: c.slug, name: c.name }));
  const categories = cats.length ? cats : CATEGORIES.map((c) => ({ slug: c.id, name: c.label }));
  return (
    <MarketShell user={me} active="">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-orange-deep"><LifeBuoy className="h-4 w-4" aria-hidden /> Support</p>
        <h1 className="mt-2 text-[clamp(1.9rem,4.5vw,2.8rem)] font-bold leading-tight text-ink">How can we help?</h1>
        <p className="mt-3 text-[18px] leading-relaxed text-ink-2">Raise a ticket and our team will reply on the ticket and by email.{me ? " It is linked to your GrowQR account, so you can follow it from your dashboard." : " You do not need an account: we email you a private link to follow it."}</p>
        {me ? <p className="mt-4"><Link href="/support/tickets" className="inline-flex min-h-[48px] items-center rounded-lg border border-black/[0.15] bg-white px-5 text-[15px] font-semibold text-ink hover:bg-cream-2">My tickets</Link></p> : null}
      </header>

      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {[[MessageSquare, "One place for every conversation", "Replies arrive on the ticket and in your inbox. Add details and files whenever you need to."], [ShieldCheck, "Private to you", "Only you and the GrowQR support team can see your ticket."], [LifeBuoy, "Clear status", "Open, in progress, waiting for you, resolved or closed."]].map(([Icon, t, d]) => {
          const I = Icon as typeof LifeBuoy;
          return <li key={String(t)} className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card"><I className="h-6 w-6 text-orange" aria-hidden /><h2 className="mt-2 text-[17px] font-semibold text-ink">{String(t)}</h2><p className="mt-1 text-[14.5px] text-ink-3">{String(d)}</p></li>;
        })}
      </ul>

      <section className="mt-12 max-w-3xl" aria-labelledby="new-ticket">
        <h2 id="new-ticket" className="text-[24px] font-bold text-ink">Raise a ticket</h2>
        <div className="mt-3"><Flash err={sp.e} /></div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
          <TicketForm action={publicTicketAction} captcha={captcha} categories={categories} kb={KNOWLEDGE_BASE} member={me ? { email: me.email } : null} accept={ACCEPT} limits={{ perHour: LIMITS.perHour, openAtOnce: LIMITS.openAtOnce }} />
        </div>
      </section>

      <section className="mt-12 max-w-3xl" aria-labelledby="help">
        <h2 id="help" className="text-[24px] font-bold text-ink">Good to know</h2>
        <div className="mt-3 divide-y divide-black/[0.08] rounded-2xl border border-black/[0.08] bg-white shadow-card">
          {HELP.map(([q, a]) => <details key={q} className="p-4"><summary className="cursor-pointer text-[16px] font-semibold text-ink">{q}</summary><p className="mt-2 text-[15px] text-ink-2">{a}</p></details>)}
        </div>
      </section>
    </MarketShell>
  );
}
