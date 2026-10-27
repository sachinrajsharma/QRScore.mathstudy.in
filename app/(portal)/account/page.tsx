import type { Metadata } from "next";
import Link from "next/link";
import { isVerified, mfaRequiredFor } from "@/lib/portal/auth";
import { requireUser } from "@/lib/portal/guard";
import PlanCard from "@/components/pay/PlanCard";
import MyProducts from "@/components/pay/MyProducts";
import UpgradePlans from "@/components/pay/UpgradePlans";
import ServicesCard from "@/components/pay/ServicesCard";
import { planInfo } from "@/lib/pay/plans";
import { planStacks } from "@/lib/pay/plan-value-prices";
import { Alert } from "@/components/portal/ui";
import { Card, PortalPage } from "@/components/portal/shell";
import { ResendVerification } from "@/components/portal/forms";
import { listForUser, unreadFor } from "@/lib/support/store";
import { StatusBadge } from "@/components/support/ui";

export const metadata: Metadata = { title: "My account | GrowQR" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { student: "Student", employer: "Employer", admin: "Administrator", counselor: "Staff", teacher: "Teacher", parent: "Parent" } as const;

/**
 * Landing page for every signed-in role while the dashboards are moved over from the PHP app, one phase at a time.
 * It shows the real account state (verification, two-step login) that the dashboards build on.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const verified = isVerified(me);
  const staff = mfaRequiredFor(me);
  const [tickets, unread] = await Promise.all([listForUser(me.id).catch(() => []), unreadFor(me.id).catch(() => 0)]);
  const openTickets = tickets.filter((t) => t.status !== "closed" && t.status !== "resolved");
  return (
    <PortalPage user={me} active="account" title={`Hello, ${me.name.split(" ")[0]}`} subtitle={`${ROLE_LABEL[me.role]} account`}>
      {sp.welcome ? <Alert kind="success">Welcome to GrowQR. Your account is ready.</Alert> : null}

      {me.role === "student" ? <MyProducts userId={me.id} /> : null}

      {me.role === "student" ? (
        <Card title="Your Skill Passport">
          <p className="text-[15px] text-ink-3 mb-4">Score your resume, see what to improve, and publish a QR-verifiable passport that employers can check.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/passport" className="inline-flex items-center min-h-[48px] px-5 rounded-lg bg-orange hover:bg-orange-dark text-white font-semibold text-[15px]">Open my Skill Passport</Link>
            <Link href="/studio" className="inline-flex items-center min-h-[48px] px-5 rounded-lg border border-black/[0.15] hover:bg-cream-2 text-ink font-semibold text-[15px]">Build my resume in Resume Studio</Link>
          </div>
        </Card>
      ) : null}

      {me.role === "student" ? <div id="plan"><PlanCard userId={me.id} /></div> : null}
      {me.role === "student" ? <ServicesCard userId={me.id} msg={{ ok: sp.svc === "ok" ? sp.t : undefined, err: sp.svc === "err" ? sp.e : undefined }} /> : null}
      {me.role === "student" && !me.is_demo && (await planInfo(me.id).catch(() => null)) === null ? <UpgradePlans stacks={planStacks()} /> : null}

      <Card title="Support">
        {tickets.length ? (
          <>
            <p className="text-[15px] text-ink-3 mb-3">
              {openTickets.length} open ticket{openTickets.length === 1 ? "" : "s"}
              {unread ? <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[12px] font-bold text-white">{unread} new repl{unread === 1 ? "y" : "ies"}</span> : null}
            </p>
            <ul className="mb-4 divide-y divide-black/[0.07] text-[15px]">
              {tickets.slice(0, 3).map((t) => (
                <li key={t.no} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/support/tickets/${t.no}`} className="min-w-0 truncate font-medium text-ink hover:underline">{t.no} · {t.subject}</Link>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-[15px] text-ink-3 mb-4">Stuck on something or have a question? Raise a ticket and our team will reply here.</p>}
        <div className="flex flex-wrap gap-3">
          <Link href="/support/new" className="inline-flex items-center min-h-[48px] px-5 rounded-lg bg-orange hover:bg-orange-dark text-white font-semibold text-[15px]">Raise a ticket</Link>
          <Link href="/support/tickets" className="inline-flex items-center min-h-[48px] px-5 rounded-lg border border-black/[0.15] hover:bg-cream-2 text-ink font-semibold text-[15px]">My tickets</Link>
        </div>
      </Card>

      <Card title="Account">
        <dl className="divide-y divide-black/[0.07] text-[15px]">
          <div className="flex justify-between gap-4 py-3"><dt className="text-ink-3">Name</dt><dd className="font-medium text-ink text-right">{me.name}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-ink-3">Email</dt><dd className="font-medium text-ink text-right break-all">{me.email}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-ink-3">Email confirmed</dt><dd className="font-medium text-right">{verified ? "Yes" : "Not yet"}</dd></div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-3">Two-step verification</dt>
            <dd className="font-medium text-right">{me.mfa_enabled_at ? "On" : staff ? "Required: not set up" : "Off"} · <Link className="text-orange-dark underline underline-offset-2" href="/account/mfa">{me.mfa_enabled_at ? "Manage" : "Set up"}</Link></dd>
          </div>
        </dl>
        {!verified ? (
          <div className="mt-5">
            <Alert kind="info">Confirm your email to unlock {me.role === "employer" ? "posting roles" : "applying to internships"}. Check your inbox, or ask for a new link.</Alert>
            <ResendVerification />
          </div>
        ) : null}
      </Card>
    </PortalPage>
  );
}
