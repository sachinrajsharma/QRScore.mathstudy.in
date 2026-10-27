import type { Metadata } from "next";
import Link from "next/link";
import * as AN from "@/lib/journey/analytics";
import { BUILTIN_TEMPLATE, STAGES } from "@/lib/journey/default-template";
import { currentTemplate, settings, templateVersions } from "@/lib/journey/store";
import * as WS from "@/lib/journey/workspace";
import { btnDark, btnLine, box, ConsolePage, field, Stats } from "@/components/admin/console-page";
import { adminGate } from "../gate";
import { JourneyFlash } from "@/components/journey/flash";
import { settingsAction, sweepAction, templateAction } from "./actions";

export const metadata: Metadata = { title: "Journey management | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const th = "py-2 pr-3 text-left font-medium text-ink-4";

export default async function JourneyAdmin() {
  const me = await adminGate("/console/journey");
  const [a, tpl, versions, st, unassigned] = await Promise.all([AN.compute(), currentTemplate(), templateVersions(), settings(), WS.unassignedCases(10)]);
  const stageName = (n: number) => STAGES.find((s) => s.no === n)?.name ?? `Stage ${n}`;
  return (
    <ConsolePage me={me} tab="journey" title="Overseas journey management" subtitle="Workload, bottlenecks and outcomes from real cases only, plus the workflow template and reminder rules.">
      <JourneyFlash />
      <p className="mb-4"><Link className="underline text-[14px]" href="/counselor/journey">Open the Students workspace (all cases) →</Link></p>
      <Stats items={[["Active journeys", a.cases.active], ["Deferred / withdrawn", `${a.cases.deferred} / ${a.cases.withdrawn}`], ["At high intake risk", a.atRisk.high, `${a.atRisk.watch} on watch`], ["Waiting for a consultant", unassigned.length]]} />
      {!a.enough ? <p role="note" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[14px] text-amber-900">Only {a.cases.total} journey{a.cases.total === 1 ? "" : "s"} so far. Rates and averages stay hidden until a group has at least {AN.MIN_COHORT} journeys, so a single student is never exposed and small numbers are not over-read. Counts are shown as they are.</p> : null}

      <section className={box} aria-labelledby="fn-h"><h2 id="fn-h" className="text-[18px] font-semibold text-ink mb-2">Conversion funnel</h2>
        <table className="w-full text-[14px] max-w-xl"><caption className="sr-only">Journeys reaching each milestone</caption><thead><tr><th scope="col" className={th}>Milestone</th><th scope="col" className={th}>Journeys</th><th scope="col" className={th}>Of the step before</th></tr></thead>
          <tbody>{a.funnel.map((f) => <tr key={f.label} className="border-t border-black/[0.07]"><th scope="row" className="py-2 pr-3 text-left font-normal">{f.label}</th><td className="pr-3">{f.count}</td><td>{f.ofPrev === null ? <span className="text-ink-4">{a.funnel.indexOf(f) === 0 ? "—" : "not enough data"}</span> : `${f.ofPrev}%`}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[12px] text-ink-4">Each row counts journeys that really reached the milestone, from recorded tasks and applications. Visa and arrival need verified proof.</p></section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className={box} aria-labelledby="dl-h"><h2 id="dl-h" className="text-[18px] font-semibold text-ink mb-2">Who is holding things up</h2>
          <p className="text-[13px] text-ink-3 mb-2">Days overdue across open tasks, attributed to whoever must act. Waiting on a university is shown separately and is never counted against a student.</p>
          <dl className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-cream-2 p-3"><dt className="text-[12px] text-ink-3">Student side</dt><dd className="text-[22px] font-bold">{a.delay.student}</dd></div><div className="rounded-xl bg-cream-2 p-3"><dt className="text-[12px] text-ink-3">Consultant side</dt><dd className="text-[22px] font-bold">{a.delay.consultant}</dd></div><div className="rounded-xl bg-cream-2 p-3"><dt className="text-[12px] text-ink-3">University side</dt><dd className="text-[22px] font-bold">{a.delay.university}</dd></div></dl></section>
        <section className={box} aria-labelledby="bn-h"><h2 id="bn-h" className="text-[18px] font-semibold text-ink mb-2">Bottlenecks</h2>
          {!a.bottlenecks.length ? <p className="text-[14px] text-ink-3">No step is overdue across several students.</p> : <ul className="text-[14px] divide-y divide-black/[0.07]">{a.bottlenecks.map((b) => <li key={b.taskKey} className="py-2"><b>{b.title}</b> <span className="text-ink-3">· {stageName(b.stage)}</span><br /><span className="text-ink-3">{b.overdue} overdue of {b.open} open · open {b.avgDaysOpen} days on average</span></li>)}</ul>}</section>
      </div>

      <section className={box} aria-labelledby="wl-h"><h2 id="wl-h" className="text-[18px] font-semibold text-ink mb-2">Consultant workload</h2>
        {!a.workload.length ? <p className="text-[14px] text-ink-3">No consultants yet. Create a staff login with the counselor role.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[32rem]"><caption className="sr-only">Workload per consultant</caption><thead><tr><th scope="col" className={th}>Consultant</th><th scope="col" className={th}>Active cases</th><th scope="col" className={th}>Open tasks of theirs</th><th scope="col" className={th}>Overdue on their side</th><th scope="col" className={th}>Reviews waiting</th><th scope="col" className={th}>Avg. wait (days)</th></tr></thead>
            <tbody>{a.workload.map((w) => <tr key={w.consultantId} className="border-t border-black/[0.07]"><th scope="row" className="py-2 pr-3 text-left font-medium">{w.name}</th><td>{w.cases}</td><td>{w.openTasks}</td><td className={w.overdue ? "text-red-700 font-semibold" : ""}>{w.overdue}</td><td>{w.inReview}</td><td>{w.avgReviewWaitDays ?? "—"}</td></tr>)}</tbody></table></div>)}
        {unassigned.length ? <p className="mt-3 text-[14px]">Unassigned: {unassigned.map((u) => <Link key={String(u.id)} className="underline mr-3" href={`/counselor/journey/${u.id}`}>{String(u.name)}</Link>)}</p> : null}</section>

      <section className={box} aria-labelledby="sg-h"><h2 id="sg-h" className="text-[18px] font-semibold text-ink mb-2">Stage completion and turnaround</h2>
        {!a.stages.length ? <p className="text-[14px] text-ink-3">No tasks yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px] min-w-[32rem]"><caption className="sr-only">Completion per stage</caption><thead><tr><th scope="col" className={th}>Stage</th><th scope="col" className={th}>Journeys</th><th scope="col" className={th}>Tasks done / total</th><th scope="col" className={th}>Completion</th><th scope="col" className={th}>Avg. days to finish a task</th></tr></thead>
            <tbody>{a.stages.map((s) => <tr key={s.stage} className="border-t border-black/[0.07]"><th scope="row" className="py-2 pr-3 text-left font-normal">{s.stage}. {stageName(s.stage)}</th><td>{s.cases}</td><td>{s.done} / {s.total}</td><td>{s.completionPct === null ? <span className="text-ink-4">not enough data</span> : `${s.completionPct}%`}</td><td>{s.avgTurnaroundDays ?? <span className="text-ink-4">—</span>}</td></tr>)}</tbody></table></div>)}
        {a.byDestination.length ? <p className="mt-3 text-[14px] text-ink-2">By destination: {a.byDestination.map((d) => `${d.destination.toUpperCase()} ${d.cases} journey${d.cases === 1 ? "" : "s"}${d.avgProgressPct === null ? "" : `, ${d.avgProgressPct}% average progress`}`).join(" · ")}</p> : null}</section>

      <section className={box} aria-labelledby="rl-h"><h2 id="rl-h" className="text-[18px] font-semibold text-ink mb-2">Reminders and escalation</h2>
        <form action={settingsAction} className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div><label className="block text-[12px] text-ink-3" htmlFor="rd">Remind at (days before)</label><input id="rd" name="reminder_days" defaultValue={st.reminderDays.join(", ")} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="ca">Tell consultant after (days late)</label><input id="ca" name="consultant_after" type="number" defaultValue={st.consultantAfterDays} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="ma">Tell managers after (days late)</label><input id="ma" name="manager_after" type="number" defaultValue={st.managerAfterDays} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="ud">Chase universities every (days)</label><input id="ud" name="uni_days" type="number" defaultValue={st.universityFollowupDays} className={`${field} w-full`} /></div>
          <div><label className="block text-[12px] text-ink-3" htmlFor="rs">Review should take (days)</label><input id="rs" name="review_sla" type="number" defaultValue={st.reviewSlaDays} className={`${field} w-full`} /></div>
          <button className={btnDark} type="submit">Save rules</button><input type="hidden" name="stale" value={st.staleCaseDays} /></form>
        <form action={sweepAction} className="mt-3"><button className={btnLine} type="submit">Run reminders now</button> <span className="text-[13px] text-ink-3">Also runs from the scheduled call to <code>/api/cron/journey</code>. Running twice never sends anything twice.</span></form></section>

      <section className={box} aria-labelledby="tp-h"><h2 id="tp-h" className="text-[18px] font-semibold text-ink mb-2">Workflow template</h2>
        <p className="text-[14px] text-ink-2 mb-2">Current: <b>{tpl.def.name}</b> version {tpl.version} · {tpl.def.tasks.length} possible tasks · {tpl.def.stages.length} stages (reviewed {tpl.def.reviewedOn}). A published version never changes. Publishing a new version affects <b>new students only</b>; existing cases keep the version they started on.</p>
        <table className="w-full text-[14px] max-w-2xl mb-3"><caption className="sr-only">Template versions</caption><thead><tr><th scope="col" className={th}>Version</th><th scope="col" className={th}>Source</th><th scope="col" className={th}>Note</th><th scope="col" className={th}>Cases on it</th></tr></thead>
          <tbody>{versions.map((v) => <tr key={v.version} className="border-t border-black/[0.07]"><td className="py-1.5">{v.version}</td><td>{v.source}</td><td>{v.note}</td><td>{v.cases}</td></tr>)}</tbody></table>
        <details><summary className="cursor-pointer min-h-[44px] flex items-center text-[14px] font-medium">Edit and publish a new version</summary>
          <form action={templateAction} className="mt-2 space-y-2"><label className="block text-[13px] text-ink-2" htmlFor="def">Template definition (JSON). Starts from the current version; it is checked for unknown dependencies, circular dependencies and missing evidence.</label>
            <textarea id="def" name="definition" rows={14} spellCheck={false} defaultValue={JSON.stringify(tpl.def ?? BUILTIN_TEMPLATE, null, 1)} className={`${field} w-full font-mono text-[12px]`} />
            <input name="note" placeholder="What changed (required to publish)" aria-label="What changed" className={`${field} w-full`} />
            <div className="flex gap-2"><button name="act" value="check" className={btnLine} type="submit">Check only</button><button name="act" value="publish" className={btnDark} type="submit">Publish as a new version</button></div></form></details></section>
    </ConsolePage>
  );
}
