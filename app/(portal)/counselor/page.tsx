import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import * as CAT from "@/lib/abroad/catalogue";
import * as CN from "@/lib/abroad/counsel";
import { btnLine, box, ConsolePage, Stats } from "@/components/admin/console-page";
import { claimStudentAction } from "./actions";

export const metadata: Metadata = { title: "My caseload | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left font-medium text-ink-4";

export default async function Caseload() {
  const me = await requireUser("counselor");
  await requireMfaIfStaff(me, "/counselor");
  const [cases, pool] = await Promise.all([CN.caseload(me.id), CN.unassigned(15)]);
  const sum = (k: string) => cases.reduce((a, c) => a + Number(c[k] ?? 0), 0);
  return (
    <ConsolePage me={me} tab="caseload" plain title="My caseload" subtitle="Students assigned to you, with what needs your attention first.">
      <Stats items={[["My students", cases.length], ["Documents to verify", sum("docs_pending")], ["Applications to review", sum("apps_review")], ["Waiting for a counselor", pool.length]]} />
      <section className={box} aria-labelledby="cl-h"><h2 id="cl-h" className="text-[18px] font-semibold text-ink mb-3">Assigned students</h2>
        {!cases.length ? <p className="text-[14px] text-ink-3">No students yet. Pick someone up from the waiting list below, or ask an admin to assign students.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[40rem]">
            <thead><tr><th scope="col" className={th}>Student</th><th scope="col" className={th}>Stage</th><th scope="col" className={th}>Intake</th><th scope="col" className={th}>Docs to verify</th><th scope="col" className={th}>Apps to review</th><th scope="col" className={th}><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{cases.map((s) => (
              <tr key={String(s.user_id)} className="border-t border-black/[0.07]">
                <td className="py-2.5 pr-3"><b>{String(s.name)}</b><br /><small className="text-ink-4">{String(s.level)} &middot; {String(s.field)}</small></td>
                <td className="pr-3">{CAT.STAGES[String(s.stage)]?.[0] ?? String(s.stage)}</td><td className="pr-3">{String(s.intake ?? "")}</td><td className="pr-3">{Number(s.docs_pending)}</td><td className="pr-3">{Number(s.apps_review)}</td>
                <td><Link className={`${btnLine} inline-flex items-center`} href={`/counselor/student/${s.user_id}`}>Open<span className="sr-only"> {String(s.name)}</span></Link></td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
      <section className={box} aria-labelledby="wl-h"><h2 id="wl-h" className="text-[18px] font-semibold text-ink mb-3">Waiting for a counselor</h2>
        {!pool.length ? <p className="text-[14px] text-ink-3">Everyone with a finished profile has a counselor.</p> : (
          <ul className="divide-y divide-black/[0.07]">{pool.map((s) => (
            <li key={String(s.user_id)} className="py-2.5 flex flex-wrap items-center justify-between gap-2"><span className="text-[14px]"><b>{String(s.name)}</b> <span className="text-ink-3">{String(s.level)} &middot; {String(s.field)} &middot; {String(s.intake ?? "")}</span></span>
              <form action={claimStudentAction}><input type="hidden" name="student_id" value={String(s.user_id)} /><button className={btnLine} type="submit">Take this student<span className="sr-only">: {String(s.name)}</span></button></form></li>
          ))}</ul>)}
      </section>
    </ConsolePage>
  );
}
