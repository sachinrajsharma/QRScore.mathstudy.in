import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/portal/guard";
import { isVerified } from "@/lib/portal/auth";
import * as A from "@/lib/abroad/catalogue";
import { intakes } from "@/lib/abroad/options";
import { ABROAD_PACKAGES, PACKAGE_DISCLAIMER } from "@/lib/abroad/packages";
import { legacyCards, prefill } from "@/lib/journey/legacy";
import * as NT from "@/lib/journey/notify";
import { viewCase, type TaskView } from "@/lib/journey/service";
import { caseOfUser, consultantOf, timeline } from "@/lib/journey/store";
import { appProgress } from "@/lib/journey/apps";
import { STAGES } from "@/lib/journey/default-template";
import { JourneyFlash as Flash } from "@/components/journey/flash";
import { Roadmap } from "@/components/journey/Roadmap";
import { Bar, btnGhost, btnPrimary, day, HONESTY, input, label, StatusBadge, Tile, TaskRow, when } from "@/components/journey/parts";
import { Card, PortalPage } from "@/components/portal/shell";
import { Alert } from "@/components/portal/ui";
import { ResendVerification } from "@/components/portal/forms";
import { startJourneyAction } from "@/app/abroad/journey-actions";

export const metadata: Metadata = { title: "My overseas education journey | GrowQR" };
export const dynamic = "force-dynamic";

const OFFER_STATES = new Set(["offer", "accepted"]);

export default async function JourneyDashboard() {
  const me = await requireUser("student");
  const c = await caseOfUser(me.id);
  if (!c) return <Setup me={me} />;
  const [v, unread, consultant, events] = await Promise.all([viewCase(c.id), NT.unreadCount(me.id), consultantOf(c.consultantId), timeline(c.id, 10)]);
  if (!v) return null;
  const apps = v.loaded.apps;
  const prog = await appProgress(c.id);
  const byStage = new Map<number, TaskView[]>();
  for (const t of v.tasks) if (!t.ent.locked) byStage.set(t.task.stage, [...(byStage.get(t.task.stage) ?? []), t]);
  const stageStat = new Map(v.progress.stages.map((s) => [s.stage, s]));
  const cards = legacyCards(v.progress.stages);
  const pkg = ABROAD_PACKAGES.find((p) => p.level === v.level);
  const appName = (id: number | null) => apps.find((a) => a.id === id)?.uniName;
  const offers = apps.filter((a) => OFFER_STATES.has(a.status));
  const visa = byStage.get(10) ?? [];
  const visaStat = stageStat.get(10);
  const firstOpenStage = [...stageStat.values()].find((s) => s.done < s.total)?.stage ?? 1;
  const cs = await A.countries();

  return (
    <PortalPage user={me} active="abroad" title="Your 12-stage checklist" subtitle={<><Link href="/abroad" className="underline">← Back to Study abroad</Link> · {cs[c.destination]?.name ?? c.destination} · {c.degree} · {c.intake}</>} wide="full">
      <Flash />
      {!isVerified(me) ? <><Alert kind="info">Confirm your email to save documents and complete tasks.</Alert><div className="mb-6"><ResendVerification /></div></> : null}
      {c.status === "withdrawn" ? <Alert kind="info">This journey was withdrawn. Everything you recorded is kept. Contact your consultant if you want to start again.</Alert> : null}
      {v.risk.level !== "none" ? (
        <div role="alert" className={`mb-5 rounded-xl border px-4 py-3 text-[14px] ${v.risk.level === "high" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <b>{v.risk.level === "high" ? "You are at risk of missing your intake." : "Keep an eye on your timeline."}</b> {v.risk.reasons.join("; ")}. Do the next actions below first{consultant ? ", or message your consultant" : ""}. This is a planning warning, not a prediction of any decision.
        </div>
      ) : null}

      <Roadmap stages={v.progress.stages} />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <section aria-labelledby="ov-h" className="lg:col-span-2 bg-white rounded-2xl border border-black/[0.08] shadow-card p-5">
          <h2 id="ov-h" className="text-[18px] font-semibold text-ink">Overall progress: {v.progress.pct}%</h2>
          <p className="text-[13px] text-ink-3 mb-3">{v.progress.done} of {v.progress.total} steps done. Steps that do not apply to you are not counted.</p>
          <Bar pct={v.progress.pct} label="Overall progress" />
          <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mt-5">
            <Tile label="To do" value={v.counts.pending} />
            <Tile label="With your consultant" value={v.counts.awaitingReview} />
            <Tile label="Overdue (yours)" value={v.counts.overdueStudent} tone={v.counts.overdueStudent ? "bad" : "plain"} />
            <Tile label="Waiting on university" value={v.counts.waitingUniversity} note="Not counted as your delay" />
            <Tile label="Blocked" value={v.counts.blocked} tone={v.counts.blocked ? "warn" : "plain"} note="Waiting on another step" />
          </dl>
        </section>
        <section aria-labelledby="co-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5">
          <h2 id="co-h" className="text-[18px] font-semibold text-ink mb-2">Your consultant</h2>
          {consultant ? (
            <p className="text-[14px] text-ink-2"><b className="text-ink">{consultant.name}</b><br /><a className="underline" href={`mailto:${consultant.email}`}>{consultant.email}</a></p>
          ) : <p className="text-[14px] text-ink-3">A consultant will be assigned soon. You can already work on your own steps.</p>}
          <p className="mt-3 text-[13px] text-ink-3">Package: <b className="text-ink">{pkg ? pkg.name : "Free planning"}</b>{v.locked.length ? ` · ${v.locked.length} extra services unlock with a higher package` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Link href="/abroad/packages" className={btnGhost + " inline-flex items-center"}>See packages</Link>
            <Link href="/abroad/journey/notifications" className={btnGhost + " inline-flex items-center"}>Notifications{unread ? ` (${unread})` : ""}</Link></div>
        </section>
      </div>

      <section aria-labelledby="next-h" className="mb-8 rounded-2xl border-2 border-orange/50 bg-orange-light/40 p-5">
        <h2 id="next-h" className="text-[20px] font-bold text-ink">Your next actions</h2>
        {!v.next.length ? <p className="mt-2 text-[15px] text-ink-2">Nothing is waiting on you right now. {v.counts.awaitingReview ? "Your consultant is reviewing your work." : v.counts.waitingUniversity ? "We are waiting for universities to reply." : ""}</p> : (
          <ul className="mt-2">{v.next.map((t) => <TaskRow key={t.task.id} v={t} href={`/abroad/journey/task/${t.task.id}`} appLabel={appName(t.task.applicationId)} />)}</ul>
        )}
      </section>

      <h2 className="text-[20px] font-bold text-ink mb-3">Your stages</h2>
      <div className="space-y-3 mb-8">
        {STAGES.filter((s) => byStage.has(s.no)).map((s) => {
          const st = stageStat.get(s.no);
          const tasks = byStage.get(s.no) ?? [];
          const groups = [...new Set(tasks.map((t) => t.task.sub))];
          return (
            <details key={s.no} id={`stage-${s.no}`} open={s.no === firstOpenStage} className="scroll-mt-24 group bg-white rounded-2xl border border-black/[0.08] shadow-card">
              <summary className="cursor-pointer list-none p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 min-h-[44px]">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-ink-4">{s.track ? "Optional track" : `Stage ${s.no}`}</span>
                  <span className="block text-[17px] font-semibold text-ink">{s.name}</span>
                  <span className="block text-[13px] text-ink-3">{s.blurb}</span>
                </span>
                <span className="sm:w-56"><span className="text-[13px] text-ink-2">{st ? `${st.done} of ${st.total} done (${st.pct}%)` : "No steps"}</span><Bar pct={st?.pct ?? 0} label={`${s.name} progress`} /></span>
              </summary>
              <div className="px-4 sm:px-5 pb-4">
                {groups.map((g) => (
                  <div key={g} className="mb-2"><h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-4 mt-3">{g}</h3>
                    <ul>{tasks.filter((t) => t.task.sub === g).map((t) => <TaskRow key={t.task.id} id={`t${t.task.id}`} v={t} href={`/abroad/journey/task/${t.task.id}`} appLabel={appName(t.task.applicationId)} />)}</ul></div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {v.locked.length ? (
        <Card title="Included in higher packages">
          <p className="text-[14px] text-ink-3 mb-3">These services are delivered by your counsellors and are part of a higher package. They stay visible so you know what exists. Your own steps and every critical deadline are always shown above.</p>
          <ul className="divide-y divide-black/[0.07]">{v.locked.slice(0, 12).map((t) => <TaskRow key={t.task.id} v={t} href="/abroad/packages" />)}</ul>
          <p className="mt-3 text-[12px] text-ink-4">{PACKAGE_DISCLAIMER}</p>
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <section aria-labelledby="ap-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-2">
          <div className="flex justify-between items-baseline"><h2 id="ap-h" className="text-[18px] font-semibold text-ink">Applications by university</h2><Link href="/abroad/journey/applications" className="text-[14px] underline">Manage</Link></div>
          {!apps.length ? <p className="mt-2 text-[14px] text-ink-3">No universities yet. Your shortlist appears here once you and your consultant add them.</p> : (
            <ul className="mt-2 divide-y divide-black/[0.07]">{apps.map((a) => {
              const p = prog.get(a.id);
              return <li key={a.id} className="py-2.5"><p className="text-[15px] font-medium text-ink">{a.uniName} <span className="text-ink-3 font-normal">· {a.programme} · {a.intake}</span></p>
                <p className="text-[13px] text-ink-3"><span className="capitalize">{a.category}</span> · <b className="text-ink-2 capitalize">{a.status.replace("_", " ")}</b>{p ? ` · ${p.done}/${p.total} steps${p.overdue ? `, ${p.overdue} overdue` : ""}` : ""}</p></li>;
            })}</ul>)}
        </section>
        <section aria-labelledby="of-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-2">
          <h2 id="of-h" className="text-[18px] font-semibold text-ink">Compare your offers</h2>
          {!offers.length ? <p className="mt-2 text-[14px] text-ink-3">No offers recorded yet. When a university decides, the letter and its terms appear here.</p> : (
            <div className="overflow-x-auto mt-2"><table className="w-full text-[14px] min-w-[28rem]"><caption className="sr-only">Offers side by side</caption>
              <thead><tr className="text-left text-ink-4"><th scope="col" className="py-1.5 pr-3 font-medium">University</th><th scope="col" className="pr-3 font-medium">Type</th><th scope="col" className="pr-3 font-medium">Reply by</th><th scope="col" className="pr-3 font-medium">Deposit</th><th scope="col" className="font-medium">Status</th></tr></thead>
              <tbody>{offers.map((a) => <tr key={a.id} className="border-t border-black/[0.07]"><th scope="row" className="py-2 pr-3 text-left font-medium text-ink">{a.uniName}<br /><span className="font-normal text-ink-3">{a.programme}</span></th><td className="pr-3 capitalize">{a.offerType || "to be recorded"}</td><td className="pr-3">{day(a.offerDeadline)}</td><td className="pr-3">{a.depositAmount || "—"}</td><td className="capitalize">{a.status}</td></tr>)}</tbody></table>
              <p className="mt-2 text-[12px] text-ink-4">Tuition, scholarship and living costs are on each university&apos;s own offer letter. Confirm every figure there.</p></div>)}
        </section>
        <section aria-labelledby="vs-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-2">
          <h2 id="vs-h" className="text-[18px] font-semibold text-ink">Visa progress</h2>
          {!visaStat ? <p className="mt-2 text-[14px] text-ink-3">Your visa checklist starts once you accept an offer.</p> : (
            <><p className="text-[13px] text-ink-3 mb-2">{visaStat.done} of {visaStat.total} visa steps done. Visa decisions are made only by the immigration authority.</p><Bar pct={visaStat.pct} label="Visa progress" />
              <ul className="mt-2">{visa.slice(0, 5).map((t) => <li key={t.task.id} className="py-1.5 flex justify-between gap-2 text-[14px]"><Link className="underline" href={`/abroad/journey/task/${t.task.id}`}>{t.task.title}</Link><StatusBadge status={t.effective} /></li>)}</ul></>)}
        </section>
        <section aria-labelledby="tl-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-2">
          <h2 id="tl-h" className="text-[18px] font-semibold text-ink mb-2">Timeline</h2>
          <ul className="space-y-2 text-[14px] text-ink-2">{events.map((e) => <li key={String(e.id)}><b className="text-ink">{e.kind === "status" ? `Step ${String(e.to_status).replace(/_/g, " ")}` : String(e.kind).replace(".", " ")}</b> {e.note ? `· ${String(e.note).slice(0, 110)}` : ""} <span className="text-ink-4">· {when(String(e.created_at))}{e.actor ? ` · ${e.actor}` : ""}</span></li>)}</ul>
          <Link className="mt-3 inline-block text-[14px] underline" href="/abroad/journey/documents">Open my documents</Link> · <Link className="text-[14px] underline" href="/abroad">Earlier tracker view</Link>
        </section>
      </div>
      <p className="mt-6 text-[12px] text-ink-4">{HONESTY}</p>
    </PortalPage>
  );
}

async function Setup({ me }: { me: Awaited<ReturnType<typeof requireUser>> }) {
  const pre = await prefill(me.id);
  const cs = await A.countries();
  const opts = intakes().filter((x) => x !== "Not sure yet");
  const row = "flex items-start gap-2.5 min-h-[44px] text-[15px] text-ink-2";
  return (
    <PortalPage user={me} active="abroad" title="Start your overseas education journey" subtitle="Answer a few questions and we build the exact checklist you need: only the steps that apply to you." wide>
      <Flash />
      {!isVerified(me) ? <><Alert kind="info">Confirm your email first, then start your journey.</Alert><div className="mb-6"><ResendVerification /></div></> : null}
      {pre.hasLegacy ? <Alert kind="info">We found your earlier study-abroad profile. We pre-filled what we could, and will bring your applications and documents across. Nothing is marked done unless it can be proved.</Alert> : null}
      <form action={startJourneyAction} className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-7 space-y-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className={label} htmlFor="destination">Destination country</label>
            <select id="destination" name="destination" required defaultValue={pre.destination ?? ""} className={input}><option value="" disabled>Choose…</option>{Object.entries(cs).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</select></div>
          <div><label className={label} htmlFor="degree">Degree level</label>
            <select id="degree" name="degree" required defaultValue={pre.degree ?? "PG"} className={input}><option value="UG">Undergraduate</option><option value="PG">Master&apos;s</option><option value="PhD">PhD / research</option></select></div>
          <div><label className={label} htmlFor="intake">Target intake</label>
            <select id="intake" name="intake" required defaultValue={pre.intake && opts.includes(pre.intake) ? pre.intake : opts[0]} className={input}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
        </div>
        <fieldset><legend className="text-[15px] font-semibold text-ink mb-1">Tell us about you</legend>
          <div className="grid sm:grid-cols-2 gap-x-6">
            {([["englishExempt", "I may be exempt from an English test (for example, my degree was taught in English)"], ["entranceTestNeeded", "My programme may need GRE, GMAT or SAT"], ["needsLoan", "I plan to take an education loan"], ["wantsScholarship", "I want to apply for scholarships"], ["needsAccommodation", "I need help with accommodation"], ["hasWorkExperience", "I have work experience"], ["hasStudyGap", "I have a gap in my studies"], ["portfolioNeeded", "My programme needs a portfolio or research proposal"], ["wantsInternship", "I want to plan internships abroad"], ["wantsPartTime", "I want to plan part-time work abroad"]] as const).map(([k, t]) => (
              <label key={k} className={row}><input type="checkbox" name={k} className="mt-1 h-5 w-5 accent-orange" /><span>{t}</span></label>
            ))}
          </div>
        </fieldset>
        <p className="text-[13px] text-ink-3">You can change these later with your consultant. The checklist never shows steps that do not apply to you. {HONESTY}</p>
        <button type="submit" className={btnPrimary}>Build my checklist</button>
      </form>
    </PortalPage>
  );
}
