import Link from "next/link";
import { Card } from "@/components/portal/shell";
import { entitlementsFor, type Entitlement } from "@/lib/pay/entitlements";
import { ABROAD_PACKAGES, packageByKey } from "@/lib/abroad/packages";
import { caseOfUser } from "@/lib/journey/store";
import { viewCase } from "@/lib/journey/service";

const day = (s: string | null): string => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** Where each kind of purchase is used. Anything not listed falls back to the course page named by its reference. */
const STUDIOS: Record<string, [string, string]> = {
  "mathematics-speed-enhancement": ["/math-speed/journey", "Open the studio"],
  "ai-reading-studio": ["/reading-studio/dashboard", "Open the studio"],
  "mathematics-studio": ["/math-studio/dashboard", "Open the studio"],
  "writing-clinic": ["/writing-clinic", "Open the studio"],
};

function where(e: Entitlement): [string, string] {
  if (e.kind === "plan") return ["#plan", "What is included"];
  if (e.kind === "consulting" && packageByKey(e.ref)) return ["/abroad", "Open my journey"];
  if (e.kind === "resume") return ["/studio", "Open Resume Studio"];
  if (STUDIOS[e.ref]) return STUDIOS[e.ref];
  if (e.kind === "course") return [`/courses/${e.ref}`, "Open the course"];
  return ["/billing", "See in Billing"];
}

/**
 * The top of the student dashboard: everything they have bought and are using right now, with how long it lasts and one button to open it, so a student
 * always knows what they hold and where they are. An overseas package also shows its level and, once a journey exists, how far along the journey is.
 */
export default async function MyProducts({ userId }: { userId: number }) {
  const all = await entitlementsFor(userId).catch(() => [] as Entitlement[]);
  const now = Date.now();
  const active = all.filter((e) => e.status === "active" && (!e.expiresAt || new Date(e.expiresAt.replace(" ", "T") + "Z").getTime() > now));
  const jc = active.some((e) => e.kind === "consulting" && packageByKey(e.ref)) ? await caseOfUser(userId).catch(() => null) : null;
  const jv = jc ? await viewCase(jc.id).catch(() => null) : null;

  return (
    <Card title="What you have">
      {active.length ? (
        <ul className="divide-y divide-black/[0.07]">
          {active.map((e) => {
            const [href, label] = where(e);
            const pkg = e.kind === "consulting" ? packageByKey(e.ref) : undefined;
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{e.title}</p>
                  <p className="text-[13px] text-ink-3">
                    {e.expiresAt ? `Active until ${day(e.expiresAt)}` : "Active"}
                    {pkg ? ` · Level ${pkg.level} of ${ABROAD_PACKAGES.length}` : ""}
                    {pkg && jv ? ` · journey ${jv.progress.pct}% complete` : ""}
                  </p>
                </div>
                <Link href={href} className="inline-flex min-h-[44px] items-center rounded-lg border border-black/[0.15] px-4 text-[14px] font-semibold text-ink hover:bg-cream-2">{label}</Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[15px] text-ink-3">You are on the free plan. Everything you buy will be listed here with how long it lasts. <Link href="/pricing" className="font-semibold underline">See plans</Link> or <Link href="/overseas-packages" className="font-semibold underline">overseas education packages</Link>.</p>
      )}
      <p className="mt-3 text-[13px] text-ink-3">Receipts and refunds are in <Link href="/billing" className="underline">Billing</Link>.</p>
    </Card>
  );
}
