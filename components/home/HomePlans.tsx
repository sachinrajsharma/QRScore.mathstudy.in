"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown, GraduationCap, Plane } from "lucide-react";
import { BillingToggle, PlanGrid } from "@/components/pricing/PlanCards";
import PackageShowcase from "@/components/abroad/PackageShowcase";
import { ABROAD_PACKAGES, rs } from "@/lib/abroad/packages";
import type { PaidPlanKey, PlanStack } from "@/lib/market/plan-value";

type Side = "plans" | "overseas";

const OVERSEAS_CTAS = Object.fromEntries(ABROAD_PACKAGES.map((p) => [p.key, { href: `/overseas-packages?pkg=${p.key}`, label: `See ${p.name}`, quote: false }]));

/**
 * Home page packages: sits right under the opening section, above "Your Journey". id="pricing" keeps the footer's Pricing link working.
 * One section, two headings: a centred switch slides between GrowQR's learning plans (left) and the overseas education packages (right).
 */
export default function HomePlans({ stacks }: { stacks: Record<PaidPlanKey, PlanStack> }) {
  const [side, setSide] = useState<Side>("plans");
  const [yearly, setYearly] = useState(false);
  const [open, setOpen] = useState(false);
  const group = useId();
  const refs = useRef<Record<Side, HTMLButtonElement | null>>({ plans: null, overseas: null });

  // a link to /#overseas-packages (or ?packages=overseas) lands on the overseas side
  useEffect(() => { if (window.location.hash === "#overseas-packages") setSide("overseas"); }, []);

  const pick = (s: Side, focus = false) => { setSide(s); if (focus) refs.current[s]?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); pick("overseas", true); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); pick("plans", true); }
  };
  const overseas = side === "overseas";

  return (
    <section id="pricing" className="scroll-mt-24 border-y border-black/5 bg-cream-2 py-16 md:py-24" aria-labelledby="home-plans">
      <span id="overseas-packages" className="block scroll-mt-24" aria-hidden />
      <div className="mx-auto max-w-[1180px] px-5 text-center">
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-4">Pricing</p>

        <div role="radiogroup" aria-label="Choose which packages to see" onKeyDown={onKey} className="relative mx-auto mt-5 grid w-full max-w-[460px] grid-cols-2 rounded-full border border-black/10 bg-white p-1.5 shadow-card">
          <span aria-hidden className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none ${overseas ? "translate-x-full bg-ink" : "translate-x-0 bg-orange"}`} />
          {([["plans", "Learning plans", GraduationCap], ["overseas", "Overseas education", Plane]] as const).map(([k, label, Icon]) => {
            const on = side === k;
            return (
              <button key={k} ref={(el) => { refs.current[k] = el; }} type="button" role="radio" name={group} aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => pick(k)}
                className={`relative z-10 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-3 text-[0.95rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-deep ${on ? "text-white" : "text-ink-3 hover:text-ink"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden />{label}
              </button>
            );
          })}
        </div>

        {overseas ? (
          <div key="overseas">
            <h2 id="home-plans" className="mx-auto mt-8 max-w-[16em] text-[clamp(2rem,4.2vw,3.2rem)] font-semibold leading-[1.07] tracking-tight text-ink">
              From first shortlist to <span className="text-orange">first month abroad</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-[38em] text-[1.05rem] leading-relaxed text-ink-3">Five levels of hands-on help from our counsellors, starting at {rs(ABROAD_PACKAGES[0].from)}. Each level includes everything in the one before it.</p>
          </div>
        ) : (
          <div key="plans">
            <h2 id="home-plans" className="mx-auto mt-8 max-w-[16em] text-[clamp(2rem,4.2vw,3.2rem)] font-semibold leading-[1.07] tracking-tight text-ink">
              Pick the Plan That Fits Your <span className="text-orange">Goals</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-[36em] text-[1.05rem] leading-relaxed text-ink-3">Start free. Upgrade when you want more courses, more practice and expert help.</p>
            <div className="mt-8"><BillingToggle yearly={yearly} onChange={setYearly} /></div>
          </div>
        )}
      </div>

      {overseas ? (
        <>
          <div className="mx-auto mt-10 max-w-[1180px] px-5"><PackageShowcase ctas={OVERSEAS_CTAS} variant="public" initial="application-pro" /></div>
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-5 text-center">
            <Link href="/overseas-packages" className="inline-flex items-center gap-1.5 text-[0.95rem] font-semibold text-ink underline underline-offset-4">Compare every service <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link href="/study-abroad" className="text-[0.95rem] font-semibold text-ink-3 underline underline-offset-4 hover:text-ink">Explore universities first</Link>
          </p>
        </>
      ) : (
        <>
          <PlanGrid yearly={yearly} headingLevel={3} stacks={stacks} collapsed={!open} />
          <div className="-mt-3 mb-8 flex justify-center px-5">
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-black/15 bg-white px-6 text-[0.95rem] font-semibold text-ink transition hover:border-ink">
              {open ? "Show less" : "See everything included"}
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </div>
          <p className="mx-auto max-w-[44em] px-5 text-center text-[0.82rem] leading-relaxed text-ink-4">
            Each price is what that item costs on its own at GrowQR today. Courses and studios bought on their own are one-time and yours to keep; inside a plan they stay open while the plan is active. Items without a price of their own are listed but never added to the totals.
          </p>
          <p className="mt-5 px-5 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-[0.95rem] font-semibold text-ink underline underline-offset-4">Compare every feature <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </p>
        </>
      )}
    </section>
  );
}
