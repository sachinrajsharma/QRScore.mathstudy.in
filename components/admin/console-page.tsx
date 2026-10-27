import Link from "next/link";
import type { ReactNode } from "react";
import type { PortalUser } from "@/lib/portal/session";
import { dropSessionData, getSession } from "@/lib/portal/session";
import { PortalPage } from "@/components/portal/shell";

export const box = "bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-5";
export const field = "px-3 py-2.5 rounded-lg border border-black/[0.15] bg-white text-[15px] min-h-[44px]";
export const btnDark = "min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold";
export const btnLine = "min-h-[44px] px-4 rounded-lg border border-black/[0.15] text-[14px] font-medium hover:bg-cream-2";

const TABS: Array<[string, string, string]> = [
  ["queue", "/console", "Review queue"], ["colleges", "/console/colleges", "Colleges"], ["studio", "/console/studio", "Resume Studio plans"],
  ["abroad", "/console/abroad", "Study abroad"], ["journey", "/console/journey", "Journey"], ["analytics", "/console/analytics", "Analytics"], ["payments", "/console/payments", "Payments"], ["reading", "/console/reading", "Reading Studio"], ["math", "/console/math", "Maths Studio"], ["demo", "/console/demo", "Demo student"], ["support", "/console/support", "Support"],
];

/** The administrator frame: tab bar plus the one-time message the last action left behind. */
export async function ConsolePage({ me, tab, title, subtitle, children, plain = false, actions }: { me: PortalUser; tab: string; title: string; subtitle?: string; children: ReactNode; plain?: boolean; actions?: ReactNode }) {
  const s = await getSession();
  const f = s?.data?.console_flash as [string, string] | undefined;
  if (f) await dropSessionData("console_flash");
  return (
    <PortalPage user={me} active={plain ? tab : "console"} title={title} subtitle={subtitle} wide="full">
      {me.is_demo ? <p role="note" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[14px] text-amber-900">Read-only demo: you can open every screen, but changes, downloads and exports are switched off.</p> : null}
      {actions ? <div className="mb-5">{actions}</div> : null}
      {plain ? null : <nav aria-label="Admin sections" className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, href, label]) => <Link key={k} href={href} aria-current={k === tab ? "page" : undefined} className={`min-h-[44px] inline-flex items-center px-4 rounded-full border text-[14px] font-medium ${k === tab ? "bg-ink text-white border-ink" : "bg-white border-black/[0.15] hover:bg-cream-2"}`}>{label}</Link>)}
      </nav>}
      {f ? <p role={f[0] === "err" ? "alert" : "status"} className={`mb-5 rounded-lg border px-3.5 py-3 text-[14px] ${f[0] === "err" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{f[1]}</p> : null}
      {children}
    </PortalPage>
  );
}

export function Stats({ items }: { items: Array<[string, string | number, string?]> }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map(([k, v, note]) => <div key={k} className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-4"><dt className="text-[13px] text-ink-4">{k}</dt><dd className="text-[24px] font-bold text-ink">{v}</dd>{note ? <dd className="text-[12px] text-ink-4">{note}</dd> : null}</div>)}
    </dl>
  );
}
