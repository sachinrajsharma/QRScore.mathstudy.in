import type { Metadata } from "next";
import Link from "next/link";
import { MarketShell, currentViewer } from "@/components/market/shell";
import { isTicketNo } from "@/lib/support/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request received | GrowQR Support", robots: { index: false, follow: false } };

/** The plain confirmation. It is also what a blocked sender or a bot sees, so it says nothing about what was or was not stored. */
export default async function Thanks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await currentViewer();
  const sp = await searchParams;
  const no = sp.no && isTicketNo(sp.no) ? sp.no : "";
  return (
    <MarketShell user={me} active="">
      <div className="max-w-2xl">
        <h1 className="text-[clamp(1.8rem,4.5vw,2.6rem)] font-bold leading-tight text-ink">{sp.again ? "That ticket is already open" : "Thank you, we have your request"}</h1>
        {no ? <p className="mt-3 text-[18px] text-ink-2">Ticket number: <b>{no}</b></p> : null}
        <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{sp.again ? "You already sent this one, so we did not open a second ticket. We have emailed the private link to the address on it." : "We will email you at the address you gave, with a private link to follow the ticket. If it does not arrive in a few minutes, check your spam folder."}</p>
        <p className="mt-6"><Link href="/support" className="underline">Back to support</Link></p>
      </div>
    </MarketShell>
  );
}
