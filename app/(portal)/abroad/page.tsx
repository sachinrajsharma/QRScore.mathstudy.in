import type { Metadata } from "next";
import Link from "next/link";
import { isVerified } from "@/lib/portal/auth";
import { requireUser } from "@/lib/portal/guard";
import * as A from "@/lib/abroad/catalogue";
import * as S from "@/lib/abroad/store";
import * as V from "@/lib/abroad/vault";
import { answerOfferAction, submitAction, visaTickAction } from "@/app/abroad/actions";
import { eraseAction } from "@/app/abroad/more-actions";
import { Flash } from "@/components/abroad/parts";
import { viewCase } from "@/lib/journey/service";
import { caseOfUser } from "@/lib/journey/store";
import { Bar } from "@/components/journey/parts";
import { ABROAD_PACKAGES } from "@/lib/abroad/packages";
import { Roadmap } from "@/components/journey/Roadmap";
import PackagesBanner from "@/components/abroad/PackagesBanner";
import { Card, PortalPage } from "@/components/portal/shell";
import { Alert } from "@/components/portal/ui";
import { ResendVerification } from "@/components/portal/forms";

export const metadata: Metadata = { title: "Overseas education | GrowQR" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Draft", in_review: "In review", applied: "Applied", offer: "Offer", declined: "Declined", accepted: "Accepted" };
const day = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const btn = "min-h-[44px] px-4 rounded-lg text-[14px] font-semibold";

export default async function AbroadDashboard() {
  const me = await requireUser("student");
  const uid = me.id;
  const profile = await S.profile(uid);
  const complete = S.isComplete(profile);
  const stage = profile ? await S.syncStage(uid, uid) : "ONBOARDING";
  const cs = await A.countries();
  const apps = await S.applications(uid);
  const docs = await V.forUser(uid);
  const missing = await V.missingRequired(uid);
  const shortlistIds = await S.shortlistIds(uid);
  const shortlist = (await Promise.all(shortlistIds.map((id) => A.universityById(id)))).filter((u): u is A.University => u !== null);
  const history = await S.historyFor(uid, 8);
  const jc = await caseOfUser(uid);
  const jv = jc ? await viewCase(jc.id) : null;
  const keys = Object.keys(A.STAGES);
  const at = keys.indexOf(stage);

  return (
    <PortalPage user={me} active="abroad" title="Overseas education" subtitle="Your journey, applications, documents and packages in one place, with a counselor reviewing every step." wide="full">
      <Flash />
      {!isVerified(me) ? <><Alert kind="info">Confirm your email to save your profile, upload documents and start applications.</Alert><div className="mb-6"><ResendVerification /></div></> : null}

      <PackagesBanner href="/abroad/packages" />
      {jv ? (
        <section aria-labelledby="jr-h" className="mb-6 rounded-2xl border border-black/[0.08] bg-white shadow-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="jr-h" className="text-[18px] font-semibold text-ink">Your journey: {jv.progress.pct}% complete</h2>
            <Link href="/abroad/journey" className={`${btn} inline-flex items-center bg-orange hover:bg-orange-dark text-white`}>Open 12-stage checklist</Link></div>
          <p className="text-[13px] text-ink-3 mb-2">{jv.progress.done} of {jv.progress.total} steps done{jv.counts.overdueStudent ? ` · ${jv.counts.overdueStudent} overdue on your side` : ""}{jv.counts.awaitingReview ? ` · ${jv.counts.awaitingReview} with your consultant` : ""}</p>
          <Bar pct={jv.progress.pct} label="Journey progress" />
          <p className="mt-2 text-[13px] text-ink-3">Your package: <b className="text-ink">{ABROAD_PACKAGES.find((x) => x.level === jv.level)?.name ?? "Free planning"}</b> · <Link className="underline" href="/abroad/packages">{jv.level >= 5 ? "View what is included" : "Compare and upgrade"}</Link></p>
          {jv.next.length ? <><h3 className="mt-4 text-[14px] font-semibold text-ink">Do these next</h3>
            <ul className="divide-y divide-black/[0.07]">{jv.next.slice(0, 3).map((t) => <li key={t.task.id} className="py-2 flex items-center justify-between gap-3"><span className="text-[14px] text-ink-2">{t.task.title}{t.overdue ? <b className="text-red-700"> · overdue</b> : null}</span><Link href={`/abroad/journey/task/${t.task.id}`} className={`${btn} inline-flex items-center border border-black/[0.15] hover:bg-cream-2 shrink-0`}>{t.task.action || "Open"}</Link></li>)}</ul></> : null}
        </section>
      ) : (
        <section className="mb-6 rounded-2xl border border-orange/40 bg-orange-light p-5"><h2 className="text-[18px] font-semibold text-ink">Start your full journey tracker</h2>
          <p className="text-[14px] text-ink-2 mb-3">Twelve stages with a checklist built for your country and degree, due dates, reminders and your consultant&apos;s reviews. Your profile and applications come across.</p>
          <Link href="/abroad/journey" className={`${btn} inline-flex items-center bg-orange hover:bg-orange-dark text-white`}>Set up my journey</Link></section>
      )}

      {jv ? (
        <Roadmap stages={jv.progress.stages} compact />
      ) : (
      <ol className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-6" aria-label="Your stage">
        {keys.map((k, i) => (
          <li key={k} aria-current={i === at ? "step" : undefined} className={`rounded-xl border px-3 py-2.5 ${i === at ? "bg-orange-light border-orange/40" : i < at ? "bg-emerald-50 border-emerald-200" : "bg-white border-black/[0.08]"}`}>
            <b className="block text-[14px] text-ink">{i < at ? "✓ " : ""}{A.STAGES[k][0]}</b><span className="text-[12px] text-ink-3">{A.STAGES[k][1]}</span>
          </li>
        ))}
      </ol>
      )}

      {!complete ? (
        <Card title="Start with your profile">
          <p className="text-[15px] text-ink-3 mb-4">Tell us about your academics, budget and goals. It takes about three minutes and unlocks your Safe, Target and Reach universities.</p>
          <Link href="/abroad/profile" className={`${btn} inline-flex items-center bg-orange hover:bg-orange-dark text-white`}>Build my profile</Link>
        </Card>
      ) : (
        <p className="mb-6 flex flex-wrap gap-3">
          <Link href="/abroad/matches" className={`${btn} inline-flex items-center bg-orange hover:bg-orange-dark text-white`}>See my matches</Link>
          <Link href="/abroad/documents" className={`${btn} inline-flex items-center border border-black/[0.15] hover:bg-cream-2`}>My documents ({docs.length})</Link>
          <Link href="/abroad/profile" className={`${btn} inline-flex items-center border border-black/[0.15] hover:bg-cream-2`}>Edit profile</Link>
        </p>
      )}

      {complete && missing.length ? <Alert kind="info">Still needed before you can submit: {missing.map((t) => V.TYPES[t].toLowerCase()).join(", ")}. <Link className="underline" href="/abroad/documents">Upload documents</Link>.</Alert> : null}

      <nav aria-label="Planning tools" className="mb-6 flex flex-wrap gap-2">
        {[["/abroad/visa", "Visa tracker"], ["/abroad/funds", "Proof of funds"], ["/abroad/loans", "Education loans"], ["/abroad/interview", "Visa interview practice"]].map(([href, label]) => <Link key={href} href={href} className="min-h-[44px] inline-flex items-center px-4 rounded-full border border-black/[0.15] bg-white text-[14px] font-medium hover:bg-cream-2">{label}</Link>)}
      </nav>

      <section id="apps" className="mb-8" aria-labelledby="apps-h">
        <h2 id="apps-h" className="text-[20px] font-bold text-ink mb-3">Applications</h2>
        {!apps.length ? <Card><p className="text-[15px] text-ink-3">No applications yet. Shortlist a university, open it and choose &ldquo;Start application&rdquo;.</p></Card> : null}
        <div className="grid lg:grid-cols-2 gap-4">
          {apps.map((a) => {
            const c = cs[a.country_key];
            const steps = c?.visa?.steps ?? [];
            return (
              <article key={a.id} className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0"><h3 className="text-[17px] font-semibold text-ink"><Link href={`/universities/${a.uni_slug}`} className="hover:underline">{a.uni_name}</Link></h3><p className="text-[14px] text-ink-3">{a.program} &middot; {a.intake}</p></div>
                  <span className="h-fit px-3 py-1 rounded-full bg-cream-3 text-[13px] font-medium">{STATUS[a.status] ?? a.status}</span>
                </div>
                {a.status === "draft" ? (
                  <form action={submitAction} className="mt-3"><input type="hidden" name="id" value={a.id} /><button className={`${btn} bg-ink text-white`} type="submit">Submit for review</button></form>
                ) : null}
                {a.status === "offer" ? (
                  <div className="mt-3">
                    <p className="text-[14px] text-ink-2"><b>{a.offer_type === "unconditional" ? "Unconditional" : "Conditional"} offer.</b> {a.offer_note}</p>
                    <form action={answerOfferAction} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={a.id} />
                      <button name="answer" value="accept" className={`${btn} bg-orange hover:bg-orange-dark text-white`} type="submit">Accept offer</button>
                      <button name="answer" value="decline" className={`${btn} border border-black/[0.15]`} type="submit">Decline</button>
                    </form>
                  </div>
                ) : null}
                {a.status === "accepted" ? (
                  <div className="mt-3">
                    <h4 className="text-[14px] font-semibold text-ink mb-1">Visa checklist{c?.visa?.name ? `: ${c.visa.name}` : ""}</h4>
                    <ul className="space-y-1">
                      {steps.map((s, i) => (
                        <li key={s}><form action={visaTickAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="idx" value={i} />
                          <button type="submit" aria-pressed={a.visa_done.includes(i)} className="w-full text-left min-h-[44px] flex gap-2.5 items-start text-[14px] text-ink-2"><span aria-hidden="true" className={`mt-0.5 w-5 h-5 shrink-0 rounded border grid place-items-center ${a.visa_done.includes(i) ? "bg-emerald-600 border-emerald-600 text-white" : "border-black/[0.3]"}`}>{a.visa_done.includes(i) ? "✓" : ""}</span>{s}</button></form></li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {shortlist.length ? (
        <Card title="Shortlist">
          <ul className="divide-y divide-black/[0.07]">{shortlist.map((u) => <li key={u.id} className="py-3 flex justify-between gap-3"><Link className="font-medium text-ink hover:underline" href={`/universities/${u.slug}`}>{u.name}</Link><span className="text-[14px] text-ink-3">{u.city}, {cs[u.country_key]?.name}</span></li>)}</ul>
        </Card>
      ) : null}

      {history.length ? (
        <Card title="Recent activity">
          <ul className="text-[14px] text-ink-2 space-y-2">{history.map((h) => <li key={String(h.id)}><b>{String(h.to_status)}</b> {h.note ? `· ${String(h.note)}` : ""} <span className="text-ink-4">· {day(String(h.created_at))}{h.actor ? ` · ${h.actor}` : ""}</span></li>)}</ul>
        </Card>
      ) : null}
      <Card title="Your data">
        <p className="text-[14px] text-ink-3 mb-3">You can download everything we hold about your study-abroad journey, or erase it. Erasing removes your profile, applications, documents and practice sessions for good.</p>
        <div className="flex flex-wrap gap-3 items-start">
          <a href="/abroad/export" className="min-h-[44px] inline-flex items-center px-4 rounded-lg border border-black/[0.15] text-[14px] font-medium hover:bg-cream-2">Download my data</a>
          <details><summary className="cursor-pointer min-h-[44px] inline-flex items-center px-4 rounded-lg text-[14px] font-medium text-red-700 hover:bg-red-50">Erase my study-abroad data</summary>
            <form action={eraseAction} className="mt-2 flex flex-wrap gap-2 items-end"><div><label htmlFor="confirm" className="block text-[13px] text-ink-2 mb-1">Type DELETE to confirm</label><input id="confirm" name="confirm" autoComplete="off" className="px-3 py-2.5 rounded-lg border border-black/[0.15] min-h-[44px]" /></div><button type="submit" className="min-h-[44px] px-4 rounded-lg bg-red-700 text-white text-[14px] font-semibold">Erase everything</button></form>
          </details>
        </div>
      </Card>
    </PortalPage>
  );
}
