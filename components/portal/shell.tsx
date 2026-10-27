import Link from "next/link";
import type { ReactNode } from "react";
import type { PortalUser } from "@/lib/portal/session";
import PortalSidebar, { type NavGroup, type NavItem } from "@/components/portal/sidebar";

/** Page frame for signed-in portal pages: the person's own menu as a left sidebar (a drawer on phones) beside the content column. */
const ACCOUNT: NavItem = { key: "account", href: "/account", label: "My account", icon: "account" };
const BILLING: NavItem = { key: "billing", href: "/billing", label: "Billing", icon: "billing" };
const SUPPORT: NavItem = { key: "support", href: "/support/tickets", label: "Support", icon: "support" };

export function groupsFor(role: string): NavGroup[] {
  switch (role) {
    case "student":
      return [
        { title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] },
        { title: "Career", items: [
          { key: "passport", href: "/passport", label: "Skill Passport", icon: "passport" },
          { key: "studio", href: "/studio", label: "Resume Studio", icon: "studio" },
          { key: "internships", href: "/internships", label: "Internships", icon: "internships" },
          { key: "applications", href: "/applications", label: "My applications", icon: "applications" },
        ] },
        { title: "Learning", items: [
          { key: "courses", href: "/my-courses", label: "My courses", icon: "courses" },
          { key: "math-speed", href: "/math-speed/journey", label: "Maths Speed Studio", icon: "courses" },
          { key: "writing", href: "/writing-clinic", label: "English Writing Studio", icon: "courses" },
          { key: "reading-studio", href: "/reading-studio/dashboard", label: "English Reading Studio", icon: "courses" },
          { key: "math-studio", href: "/math-studio/dashboard", label: "Mathematics Studio", icon: "courses" },

          { key: "classes", href: "/my-classes", label: "My classes", icon: "classes" },
        ] },
        { title: "Global", items: [
          { key: "abroad-packages", href: "/abroad/packages", label: "Overseas education", icon: "abroad" },
          { key: "abroad", href: "/abroad", label: "Study abroad", icon: "abroad" },
          { key: "share", href: "/passport/share", label: "Share my passport", icon: "share" },
        ] },
      ];
    case "teacher":
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }, { title: "Teaching", items: [{ key: "teacher", href: "/teacher", label: "My classes", icon: "teacher" }] }];
    case "parent":
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }, { title: "Family", items: [{ key: "parent", href: "/parent", label: "My children", icon: "children" }] }];
    case "employer":
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }, { title: "Hiring", items: [
        { key: "employer", href: "/employer", label: "Hiring", icon: "hiring" },
        { key: "post", href: "/employer/post", label: "Post a role", icon: "post" },
      ] }];
    case "admin":
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }, { title: "Staff", items: [
        { key: "crm", href: "/crm", label: "Overseas CRM", icon: "crm" },
        { key: "console", href: "/console", label: "Admin console", icon: "console" },
      ] }];
    case "counselor":
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }, { title: "Staff", items: [
        { key: "crm", href: "/crm", label: "Overseas CRM", icon: "crm" },
        { key: "students", href: "/counselor/journey", label: "Students", icon: "caseload" },
      ] }];
    default:
      return [{ title: "Overview", items: [ACCOUNT, BILLING, SUPPORT] }];
  }
}

export function PortalPage({ user, active, title, subtitle, children, wide = false }: { user: PortalUser; active: string; title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean | "full" }) {
  const width = wide === "full" ? "max-w-none" : wide ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="min-h-[60vh] bg-cream-2">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:gap-8 lg:py-8">
        <PortalSidebar user={{ name: user.name, email: user.email, role: user.role }} groups={groupsFor(user.role)} active={active} />
        <main id="main" className={`w-full min-w-0 flex-1 ${width}`}>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-ink tracking-tight">{title}</h1>
          {subtitle ? <p className="text-[15px] text-ink-3 mt-1.5 mb-7">{subtitle}</p> : <div className="mb-7" />}
          {children}
        </main>
      </div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-7 mb-6 ${className}`}>
      {title ? <h2 className="text-[18px] font-semibold text-ink mb-4">{title}</h2> : null}
      {children}
    </section>
  );
}

/** A 0-100 ring. */
export function ScoreRing({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-36 h-36 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EFEEE8" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#FF6A2F" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[34px] font-bold text-ink">{Math.round(v)}</span>
    </div>
  );
}

export function Bars({ items }: { items: Array<{ name: string; percent: number }> }) {
  return (
    <ul className="space-y-3" aria-label="Score by section">
      {items.map((s) => {
        const p = Math.max(0, Math.min(100, Math.round(s.percent)));
        return (
          <li key={s.name} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] sm:grid-cols-[12rem_1fr_3rem] items-center gap-3 text-[14px]">
            <span className="text-ink-2 truncate">{s.name}</span>
            <span className="h-2.5 rounded-full bg-cream-3 overflow-hidden" aria-hidden><i className="block h-full rounded-full bg-orange" style={{ width: `${p}%` }} /></span>
            <b className="text-right text-ink">{p}%</b>
          </li>
        );
      })}
    </ul>
  );
}
