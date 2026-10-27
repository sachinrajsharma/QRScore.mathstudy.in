import type { Metadata } from "next";
import Link from "next/link";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import { reviewQueue } from "@/lib/journey/service";
import * as WS from "@/lib/journey/workspace";
import { btnLine, box, ConsolePage, field, Stats } from "@/components/admin/console-page";
import { Bar, day } from "@/components/journey/parts";
import { JourneyFlash } from "@/components/journey/flash";
import { claimAction } from "./actions";

export const metadata: Metadata = { title: "Journey workspace | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left font-medium text-ink-4";
const COUNTRIES = [["usa", "USA"], ["uk", "UK"], ["canada", "Canada"], ["germany", "Germany"], ["australia", "Australia"], ["france", "France"], ["uae", "UAE"]];

export default async function Workspace({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser("counselor", "admin");
  await requireMfaIfStaff(me, "/counselor/journey");
  const q = await searchParams;
  const who = { id: me.id, role: me.role as "counselor" | "admin" };
  const win = ([7, 14, 30] as const).find((x) => String(x) === q.window) ?? 7;
  const f: WS.Filters = { country: q.country, university: q.university, intake: q.intake, consultant: q.consultant === "none" ? "none" : q.consultant ? Number(q.consultant) : undefined, status: q.status, urgency: (q.urgency as WS.Filters["urgency"]) || undefined, q: q.q };
  const [rows, queue, due, risks, pool, cons] = await Promise.all([WS.caseload(who, f), reviewQueue(who), WS.deadlines(who, win), WS.riskAlerts(who), WS.unassignedCases(10), me.role === "admin" ? WS.consultants() : Promise.resolve([])]);
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
  const sum = (k: keyof WS.CaseRowList) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return (
    <ConsolePage me={me} tab="students" plain title="Journey workspace" subtitle={me.role === "admin" ? "All cases, because you are an administrator." : "Your assigned students, what is waiting on you, and who is at risk."}>
      <JourneyFlash />
      <p className="mb-4 text-[13px] text-ink-3">Students not yet on the journey tracker are still in the <Link className="underline" href="/counselor?legacy=1">earlier caseload</Link>.</p>
      <Stats items={[["Cases shown", rows.length], ["Awaiting your review", queue.length], ["Overdue tasks", sum("overdue")], ["At-risk cases", risks.length]]} />

      <section className={box} aria-labelledby="rq-h"><h2 id="rq-h" className="text-[18px] font-semibold text-ink mb-2">Review queue <span className="text-ink-4 font-normal">(oldest first)</span></h2>
        {!queue.length ? <p className="text-[14px] text-ink-3">Nothing is waiting for review.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[36rem]"><caption className="sr-only">Tasks submitted for review</caption>
            <thead><tr><th scope="col" className={th}>Student</th><th scope="col" className={th}>Task</th><th scope="col" className={th}>Waiting</th><th scope="col" className={th}><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{queue.slice(0, 15).map((r) => (
              <tr key={r.taskId} className="border-t border-black/[0.07]"><td className="py-2 pr-3"><b>{r.student}</b></td><td className="pr-3">{r.title}{r.app ? <span className="text-ink-3"> · {r.app}</span> : null}{r.priority === "critical" ? <b className="ml-1 text-red-700">Critical</b> : null}</td>
                <td className={`pr-3 ${r.waitDays >= 3 ? "text-red-700 font-semibold" : ""}`}>{r.waitDays} day{r.waitDays === 1 ? "" : "s"}</td><td><Link className={`${btnLine} inline-flex items-center`} href={`/counselor/journey/${r.caseId}#t${r.taskId}`}>Review<span className="sr-only"> {r.title}</span></Link></td></tr>))}</tbody></table></div>)}
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className={box} aria-labelledby="dl-h"><div className="flex flex-wrap items-baseline justify-between gap-2 mb-2"><h2 id="dl-h" className="text-[18px] font-semibold text-ink">Deadlines</h2>
          <nav aria-label="Deadline window" className="flex gap-1">{([7, 14, 30] as const).map((d) => <Link key={d} aria-current={d === win ? "page" : undefined} href={`?${new URLSearchParams({ ...(Object.fromEntries(new URLSearchParams(qs))), window: String(d) })}`} className={`min-h-[36px] inline-flex items-center rounded-full border px-3 text-[13px] ${d === win ? "bg-ink text-white border-ink" : "border-black/[0.15] hover:bg-cream-2"}`}>{d} days</Link>)}</nav></div>
          {!due.length ? <p className="text-[14px] text-ink-3">No open deadlines in the next {win} days.</p> : (
            <ul className="divide-y divide-black/[0.07] max-h-[22rem] overflow-y-auto">{due.slice(0, 40).map((d) => (
              <li key={d.taskId} className="py-2 text-[14px]"><Link className="font-medium underline" href={`/counselor/journey/${d.caseId}#t${d.taskId}`}>{d.title}</Link><br /><span className="text-ink-3">{d.student} · {d.owner} · {d.status.replace(/_/g, " ")} · </span><span className={d.days < 0 ? "font-semibold text-red-700" : "text-ink-3"}>{d.days < 0 ? `${-d.days} day${d.days === -1 ? "" : "s"} overdue` : d.days === 0 ? "due today" : `in ${d.days} day${d.days === 1 ? "" : "s"}`}</span></li>))}</ul>)}
        </section>
        <section className={box} aria-labelledby="rk-h"><h2 id="rk-h" className="text-[18px] font-semibold text-ink mb-2">Risk alerts</h2>
          {!risks.length ? <p className="text-[14px] text-ink-3">No case is behind its intake pace right now.</p> : (
            <ul className="divide-y divide-black/[0.07] max-h-[22rem] overflow-y-auto">{risks.map((r) => (
              <li key={r.caseId} className="py-2 text-[14px]"><Link className="font-medium underline" href={`/counselor/journey/${r.caseId}`}>{r.student}</Link> <b className={r.level === "high" ? "text-red-700" : "text-amber-800"}>{r.level === "high" ? "High risk" : "Watch"}</b><br /><span className="text-ink-3">{r.destination.toUpperCase()} · {r.intake} · {r.pct}% done · {r.reasons.join("; ")}</span></li>))}</ul>)}
        </section>
      </div>

      {me.role === "counselor" && pool.length ? (
        <section className={box} aria-labelledby="wl-h"><h2 id="wl-h" className="text-[18px] font-semibold text-ink mb-2">Waiting for a consultant</h2>
          <ul className="divide-y divide-black/[0.07]">{pool.map((p) => <li key={String(p.id)} className="py-2.5 flex flex-wrap items-center justify-between gap-2"><span className="text-[14px]"><b>{String(p.name)}</b> <span className="text-ink-3">{String(p.destination).toUpperCase()} · {String(p.intake)}</span></span>
            <form action={claimAction}><input type="hidden" name="case_id" value={String(p.id)} /><button className={btnLine} type="submit">Take this student<span className="sr-only">: {String(p.name)}</span></button></form></li>)}</ul></section>
      ) : null}

      <section className={box} aria-labelledby="cl-h"><h2 id="cl-h" className="text-[18px] font-semibold text-ink mb-3">Cases</h2>
        <form method="get" className="mb-4 grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 items-end">
          <div><label className="block text-[12px] text-ink-3" htmlFor="fq">Student</label><input id="fq" name="q" defaultValue={q.q} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="fc">Country</label><select id="fc" name="country" defaultValue={q.country ?? ""} className={`${field} w-full`}><option value="">All</option>{COUNTRIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="fu">University</label><input id="fu" name="university" defaultValue={q.university} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="fi">Intake</label><input id="fi" name="intake" defaultValue={q.intake} placeholder="Fall 2027" className={`${field} w-full`} /></div>
          {me.role === "admin" ? <div><label className="block text-[12px] text-ink-3" htmlFor="fk">Consultant</label><select id="fk" name="consultant" defaultValue={q.consultant ?? ""} className={`${field} w-full`}><option value="">All</option><option value="none">Unassigned</option>{cons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div> : null}
          <div><label className="block text-[12px] text-ink-3" htmlFor="fs">Case status</label><select id="fs" name="status" defaultValue={q.status ?? ""} className={`${field} w-full`}><option value="">Any</option>{["active", "deferred", "withdrawn", "completed"].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="fg">Urgency</label><select id="fg" name="urgency" defaultValue={q.urgency ?? ""} className={`${field} w-full`}><option value="">Any</option><option value="overdue">Has overdue tasks</option><option value="critical">Critical overdue</option><option value="due7">Due in 7 days</option><option value="review">Awaiting review</option></select></div>
          <div className="flex gap-2"><button className="min-h-[44px] px-4 rounded-lg bg-ink text-white text-[14px] font-semibold" type="submit">Filter</button><Link className={`${btnLine} inline-flex items-center`} href="/counselor/journey">Clear</Link></div>
        </form>
        <p className="mb-2"><a className={`${btnLine} inline-flex items-center`} href={`/counselor/journey/export${qs ? "?" + qs : ""}`}>Export these cases (CSV)</a></p>
        {!rows.length ? <p className="text-[14px] text-ink-3">No cases match.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[52rem]"><caption className="sr-only">Cases</caption>
            <thead><tr><th scope="col" className={th}>Student</th><th scope="col" className={th}>Destination</th><th scope="col" className={th}>Intake</th><th scope="col" className={th}>Stage</th><th scope="col" className={th}>Progress</th><th scope="col" className={th}>Overdue</th><th scope="col" className={th}>Review</th><th scope="col" className={th}>Consultant</th><th scope="col" className={th}><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.caseId} className="border-t border-black/[0.07]"><td className="py-2.5 pr-3"><b>{r.student}</b><br /><small className="text-ink-4">{r.degree}{r.universities ? ` · ${r.universities.slice(0, 40)}` : ""}</small></td><td className="pr-3">{r.destination.toUpperCase()}</td><td className="pr-3">{r.intake}</td><td className="pr-3">{r.stage || "—"}</td>
                <td className="pr-3 w-36"><Bar pct={r.pct} label={`${r.student} progress`} /><small className="text-ink-4">{r.pct}% · last activity {day(r.lastEvent)}</small></td>
                <td className={`pr-3 ${r.criticalOverdue ? "text-red-700 font-bold" : r.overdue ? "text-amber-800 font-semibold" : ""}`}>{r.overdue}{r.criticalOverdue ? ` (${r.criticalOverdue} critical)` : ""}</td><td className="pr-3">{r.review}</td><td className="pr-3">{r.consultant ?? <i className="text-ink-4">Unassigned</i>}</td>
                <td><Link className={`${btnLine} inline-flex items-center`} href={`/counselor/journey/${r.caseId}`}>Open<span className="sr-only"> {r.student}</span></Link></td></tr>))}</tbody></table></div>)}
      </section>
    </ConsolePage>
  );
}
