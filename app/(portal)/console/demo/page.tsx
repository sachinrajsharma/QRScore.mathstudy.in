import type { Metadata } from "next";
import Link from "next/link";
import { box, btnDark, btnLine, ConsolePage } from "@/components/admin/console-page";
import { dropSessionData, getSession } from "@/lib/portal/session";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/investor";
import { one } from "@/lib/portal/db";
import { adminGate } from "../gate";
import { createDemoAction, removeDemoAction } from "./actions";

export const metadata: Metadata = { title: "Demo student | Console | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DemoConsole() {
  const me = await adminGate("/console/demo");
  const s = await getSession();
  const steps = (s?.data?.demo_steps as string[] | undefined) ?? [];
  if (steps.length) await dropSessionData("demo_steps");
  const exists = await one<{ id: number }>("SELECT id FROM users WHERE email = $1 AND is_demo = 1", [DEMO_EMAIL]);
  return (
    <ConsolePage me={me} tab="demo" title="Demo student" subtitle="A read-only student login with two purchases and a full overseas journey, for showing the product to senior reviewers and partners.">
      <section className={box} aria-labelledby="demo-h">
        <h2 id="demo-h" className="mb-2 text-[18px] font-semibold text-ink">{exists ? "The demo student exists" : "Create the demo student"}</h2>
        <p className="mb-4 max-w-[46em] text-[14px] leading-relaxed text-ink-3">
          Creates <b>one student</b> who has bought the <b>Pro plan (₹599)</b> and the <b>Overseas education: Academic &amp; Admission Incubator</b> package, with a UK Master&apos;s journey a few days in,
          three university applications and a consultant. Everything is dummy data and no money moves. The login is <b>read-only</b>: people can open every screen but cannot change or download anything.
          Run it again to reset the demo. Use it on a demo site only: the two orders will also appear in payment reports until you remove them.
        </p>
        <dl className="mb-4 grid max-w-[34em] grid-cols-[7em_1fr] gap-y-1 text-[15px]"><dt className="text-ink-3">Email</dt><dd className="font-mono font-semibold text-ink">{DEMO_EMAIL}</dd><dt className="text-ink-3">Password</dt><dd className="font-mono font-semibold text-ink">{DEMO_PASSWORD}</dd><dt className="text-ink-3">Sign in at</dt><dd><Link href="/login" className="underline">/login</Link></dd></dl>
        <div className="flex flex-wrap gap-3">
          <form action={createDemoAction}><button type="submit" className={btnDark}>{exists ? "Rebuild the demo student" : "Create the demo student"}</button></form>
          {exists ? <form action={removeDemoAction}><button type="submit" className={btnLine}>Remove the demo student</button></form> : null}
        </div>
        {steps.length ? <ul className="mt-5 list-disc pl-5 text-[14px] text-ink-2">{steps.map((t) => <li key={t}>{t}</li>)}</ul> : null}
      </section>
    </ConsolePage>
  );
}
