import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/portal/guard";
import { entitlementsFor } from "@/lib/pay/entitlements";
import { ABROAD_PACKAGES, PACKAGE_DISCLAIMER, packageByKey } from "@/lib/abroad/packages";
import PackageShowcase from "@/components/abroad/PackageShowcase";
import { packageCtas } from "@/components/abroad/package-ctas";
import { PortalPage } from "@/components/portal/shell";
import "@/components/abroad/packages.css";

export const metadata: Metadata = { title: "Overseas education packages | GrowQR" };
export const dynamic = "force-dynamic";

type SP = { pkg?: string };

export default async function AbroadPackagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser("student");
  const sp = await searchParams;
  const keys = new Set<string>(ABROAD_PACKAGES.map((p) => p.key));
  const owned = (await entitlementsFor(me.id).catch(() => [])).filter((e) => e.kind === "consulting" && e.status === "active" && keys.has(e.ref)).map((e) => e.ref);
  const initial = packageByKey(sp.pkg ?? "")?.key ?? "application-pro";
  return (
    <PortalPage user={me} active="abroad" title="Overseas education" subtitle="Expert help for every step of studying abroad. Pick a package to see exactly what it includes." wide="full">
      <div className="mb-6 flex flex-wrap gap-3 text-[14px]">
        <Link href="/abroad" className="inline-flex min-h-[44px] items-center rounded-lg border border-black/[0.15] bg-white px-4 font-semibold text-ink hover:bg-cream-2">My study-abroad journey</Link>
        <Link href="/abroad/matches" className="inline-flex min-h-[44px] items-center rounded-lg border border-black/[0.15] bg-white px-4 font-semibold text-ink hover:bg-cream-2">My university matches</Link>
        <Link href="/overseas-packages" className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold text-ink underline underline-offset-4">Compare every service</Link>
      </div>

      {owned.length ? (
        <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-5 py-3 text-[14.5px] text-emerald-900">
          Your package{owned.length > 1 ? "s" : ""}: <b>{owned.map((k) => packageByKey(k)?.name).join(", ")}</b>. Your counsellor will contact you about the next steps, and you can follow the conversation under <Link href="/support/tickets" className="font-semibold underline">Support</Link>.
        </p>
      ) : null}

      <div className="rounded-[32px] bg-gradient-to-br from-[#0b1020] via-[#10204a] to-[#1b1740] p-5 sm:p-9">
        <PackageShowcase ctas={packageCtas(true)} owned={owned} initial={initial} variant="page" headingLevel={2} />
      </div>

      <p className="mt-5 max-w-[60em] text-[12.5px] leading-relaxed text-ink-4">{PACKAGE_DISCLAIMER}</p>
    </PortalPage>
  );
}
