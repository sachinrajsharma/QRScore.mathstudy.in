import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/portal/guard";
import { appProgress } from "@/lib/journey/apps";
import { KIND_LABEL, pending as pendingExceptions, type ExKind } from "@/lib/journey/exceptions";
import { caseOfUser, loadCase } from "@/lib/journey/store";
import { intakes } from "@/lib/abroad/options";
import { JourneyFlash as Flash } from "@/components/journey/flash";
import { addApplicationAction, exceptionRequestAction } from "@/app/abroad/journey-actions";
import { Bar, btnGhost, btnPrimary, day, input, label } from "@/components/journey/parts";
import { Card, PortalPage } from "@/components/portal/shell";

export const metadata: Metadata = { title: "My applications | GrowQR" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { shortlisted: "Shortlisted", preparing: "Preparing", submitted: "Submitted", under_review: "Under review by the university", offer: "Offer received", rejected: "Not successful", waitlisted: "Waitlisted", accepted: "Accepted by you", declined: "Declined by you", withdrawn: "Withdrawn", deferred: "Deferred" };

export default async function JourneyApplications() {
  const me = await requireUser("student");
  const c = await caseOfUser(me.id);
  if (!c) redirect("/abroad/journey");
  const [l, prog, ex] = await Promise.all([loadCase(c.id), appProgress(c.id), pendingExceptions(c.id)]);
  const apps = l?.apps ?? [];
  const live = apps.filter((a) => !["rejected", "withdrawn", "declined"].includes(a.status));
  return (
    <PortalPage user={me} active="journey" title="My applications" subtitle={<Link className="underline" href="/abroad/journey">← Back to my journey</Link>} wide>
      <Flash />
      <p className="mb-4 text-[14px] text-ink-3">One application for each university, programme and intake. Each has its own steps and documents, so a rejection or a change in one never affects the others.</p>
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {apps.map((a) => {
          const p = prog.get(a.id);
          const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <article key={a.id} className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5">
              <div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="text-[17px] font-semibold text-ink">{a.uniName}</h2><p className="text-[14px] text-ink-3">{a.programme} · {a.intake} · <span className="capitalize">{a.category}</span></p></div>
                <span className="h-fit rounded-full bg-cream-3 px-3 py-1 text-[13px] font-medium whitespace-nowrap">{STATUS[a.status] ?? a.status}</span></div>
              <div className="mt-3"><Bar pct={pct} label={`${a.uniName} progress`} /><p className="mt-1 text-[13px] text-ink-3">{p ? `${p.done} of ${p.total} steps done${p.overdue ? ` · ${p.overdue} overdue` : ""}` : "No steps yet"}</p></div>
              {a.offerType ? <p className="mt-2 text-[14px] text-ink-2"><b className="capitalize">{a.offerType} offer.</b> {a.offerConditions} {a.offerDeadline ? `Reply by ${day(a.offerDeadline)}.` : ""}</p> : null}
              {a.closedReason ? <p className="mt-2 text-[13px] text-ink-3">{a.closedReason}</p> : null}
            </article>
          );
        })}
        {!apps.length ? <Card><p className="text-[15px] text-ink-3">No universities yet. Add the ones you are considering; your consultant will review the mix with you.</p></Card> : null}
      </div>
      <Card title="Add a university to your shortlist">
        <form action={addApplicationAction} className="grid sm:grid-cols-2 gap-4 items-end">
          <div><label className={label} htmlFor="uni_name">University</label><input id="uni_name" name="uni_name" required maxLength={160} className={input} /></div>
          <div><label className={label} htmlFor="programme">Programme (course)</label><input id="programme" name="programme" required maxLength={160} className={input} /></div>
          <div><label className={label} htmlFor="intake">Intake</label><select id="intake" name="intake" defaultValue={c.intake} className={input}>{[...new Set([c.intake, ...intakes().filter((x) => x !== "Not sure yet")])].map((o) => <option key={o}>{o}</option>)}</select></div>
          <div><label className={label} htmlFor="category">How realistic is it?</label><select id="category" name="category" className={input}><option value="ambitious">Ambitious (a stretch)</option><option value="target" selected>Target (a good match)</option><option value="safer">Safer (likely to fit)</option></select></div>
          <div className="sm:col-span-2"><button className={btnPrimary} type="submit">Add to shortlist</button>
            <p className="mt-2 text-[12px] text-ink-4">Categories are a planning aid, not a prediction. Universities decide admissions.</p></div>
        </form>
      </Card>
      <section id="changes" aria-labelledby="chg-h" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-7 mb-6">
        <h2 id="chg-h" className="text-[18px] font-semibold text-ink mb-1">Something changed?</h2>
        <p className="text-[14px] text-ink-3 mb-3">Tell your consultant, and they will update your plan. Nothing is deleted: the history stays and new steps are added.</p>
        <details className="mb-2"><summary className="cursor-pointer min-h-[44px] flex items-center text-[14px] font-medium">Report a rejection, visa refusal, deferral, withdrawal or refund request</summary>
          <form action={exceptionRequestAction} className="grid sm:grid-cols-2 gap-3 mt-2">
            <div><label className={label} htmlFor="kind">What happened?</label><select id="kind" name="kind" required className={input}>{(["rejection", "visa_refusal", "deferral", "change_university", "withdrawal", "refund"] as ExKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
            <div><label className={label} htmlFor="application_id">University (for a rejection or change)</label><select id="application_id" name="application_id" className={input}><option value="">Not about one university</option>{live.map((a) => <option key={a.id} value={a.id}>{a.uniName}</option>)}</select></div>
            <div><label className={label} htmlFor="new_intake">New intake (for a deferral)</label><input id="new_intake" name="new_intake" placeholder="Fall 2028" className={input} /></div>
            <div><label className={label} htmlFor="uni_name2">New university and programme (for a change)</label><div className="flex gap-2"><input id="uni_name2" name="uni_name" className={input} placeholder="University" /><input name="programme" aria-label="New programme" className={input} placeholder="Programme" /></div></div>
            <div className="sm:col-span-2"><label className={label} htmlFor="reason">Tell us what happened</label><textarea id="reason" name="reason" rows={3} required maxLength={500} className={input + " min-h-[88px]"} /></div>
            <div className="sm:col-span-2"><button className={btnGhost} type="submit">Send to my consultant</button></div>
          </form></details>
        {ex.length ? <ul className="mt-3 text-[14px] text-ink-2 space-y-1">{ex.map((x) => <li key={String(x.id)}><b>{KIND_LABEL[x.kind as ExKind]}</b> · {String(x.status)} · {String(x.reason).slice(0, 100)}</li>)}</ul> : null}
      </section>
    </PortalPage>
  );
}
