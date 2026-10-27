import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { all, one } from "@/lib/portal/db";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import * as AB from "@/lib/abroad/store";
import * as CAT from "@/lib/abroad/catalogue";
import * as CN from "@/lib/abroad/counsel";
import * as FD from "@/lib/abroad/funds";
import * as MI from "@/lib/abroad/mock-interview";
import * as VI from "@/lib/abroad/visa";
import * as VT from "@/lib/abroad/vault";
import { btnDark, btnLine, box, ConsolePage, field } from "@/components/admin/console-page";
import { studentAction } from "../../actions";

export const metadata: Metadata = { title: "Student file | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (ts: unknown, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) => new Date(String(ts).replace(" ", "T") + "Z").toLocaleString("en-IN", { ...o, timeZone: "UTC" });
const pill = (st: string) => (st === "verified" ? "bg-emerald-50 text-emerald-800" : st === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900");

function Hidden({ sid, id, act }: { sid: number; id?: number; act?: string }) {
  return <><input type="hidden" name="student_id" value={sid} />{id !== undefined ? <input type="hidden" name="id" value={id} /> : null}{act ? <input type="hidden" name="act" value={act} /> : null}</>;
}

export default async function StudentFile({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const sid = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  const me = await requireUser("counselor", "admin");
  await requireMfaIfStaff(me, `/counselor/student/${sid}`);
  const student = sid ? await one<{ id: number; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = $1 AND role = 'student'", [sid]) : null;
  const profile = student ? await AB.profile(sid) : null;
  if (!student || !profile || !(await CN.canAccess(me, sid))) notFound();

  const [docs, apps, notes, hist, pool, vCases, mSess, primary] = await Promise.all([
    VT.forUser(sid), AB.applications(sid), CN.notes(sid), AB.historyFor(sid, 10), FD.pool(sid),
    all<Record<string, unknown>>("SELECT v.*, u.name AS uni_name FROM sa_visa v JOIN sa_applications a ON a.id = v.application_id JOIN sa_universities u ON u.id = a.university_id WHERE v.user_id = $1 ORDER BY v.id", [sid]),
    MI.sessionsFor(sid, 10), FD.primaryUniversity(sid),
  ]);
  await AB.audit(me.id, sid, "profile.view", "");
  const finished = mSess.filter((m) => m.finished_at !== null && m.finished_at !== undefined);
  const fc = primary ? await CAT.country(primary.country_key) : null;
  const target = primary && fc ? FD.target(primary, fc) : null;
  const cov = target ? FD.coverage(pool, target.min_inr) : null;
  const back = me.role === "admin" ? "/console/abroad" : "/counselor?legacy=1";
  const dl = (k: string, v: string) => <><dt className="text-ink-4">{k}</dt><dd className="text-ink">{v}</dd></>;

  return (
    <ConsolePage me={me} tab={me.role === "admin" ? "abroad" : "caseload"} plain title={student.name} subtitle="Study-abroad file. Everything you open or change here is logged." actions={<Link href={back} className={`${btnLine} inline-flex items-center`}>Back</Link>}>
      <div className="grid xl:grid-cols-2 gap-x-6">
        <div>
          <section className={box} aria-labelledby="pf-h"><h2 id="pf-h" className="text-[18px] font-semibold text-ink mb-3">Profile</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-[14px]">
              {dl("Stage", CAT.STAGES[profile.stage]?.[0] ?? profile.stage)}{dl("Study level", `${profile.level} · ${profile.field}`)}{dl("Academics", `${profile.score_value ?? ""} (${profile.score_type})`)}
              {dl("English", profile.english_test === "none" ? "Not taken" : `${profile.english_test} ${profile.english_score ?? ""}`)}{dl("Budget", `${CAT.inr(Number(profile.budget_inr ?? 0))} / year`)}{dl("Intake", profile.intake)}
              {dl("Countries", profile.country_list.map((c) => c.toUpperCase()).join(", "))}{dl("Email", student.email)}
            </dl>
          </section>

          <section className={box} aria-labelledby="fd-h"><h2 id="fd-h" className="text-[18px] font-semibold text-ink mb-3">Funds and loans</h2>
            {cov && target && primary ? <p className="text-[14px] mb-2">For <b>{primary.name}</b>: needs {CAT.inr(target.min_inr)}. Documented <b>{cov.pct_documented}%</b>, with plans <b>{cov.pct_total}%</b>{cov.gap > 0 ? `, short by ${CAT.inr(cov.gap)}` : ""}.</p> : <p className="text-[14px] text-ink-3 mb-2">No application to plan funds for yet.</p>}
            <ul className="list-disc pl-5 text-[14px] space-y-1">{pool.lines.map((l) => <li key={`${l.kind}-${l.id}`}>{l.name}: {CAT.inr(l.amount)} <span className="text-ink-4">({l.documented ? (l.verified ? "verified evidence" : "evidence attached") : "no evidence"})</span></li>)}</ul>
            <p className="text-[13px] text-ink-4 mt-2">Self-reported by the student. Open the financial documents to check the evidence.</p>
          </section>

          <section className={box} aria-labelledby="vs-h"><h2 id="vs-h" className="text-[18px] font-semibold text-ink mb-3">Visa and interview practice</h2>
            {!vCases.length ? <p className="text-[14px] text-ink-3">No visa case yet.</p> : null}
            <ul className="list-disc pl-5 text-[14px] space-y-1 mb-3">{vCases.map((v) => <li key={String(v.id)}><b>{String(v.uni_name)}</b>: {VI.STAGES[String(v.stage)] ?? String(v.stage)}{v.appointment_at ? `, appointment ${when(v.appointment_at, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}${v.centre ? ` at ${String(v.centre)}` : ""}` : ""}</li>)}</ul>
            <h3 className="text-[15px] font-semibold text-ink mb-1">Practice interviews</h3>
            {!finished.length ? <p className="text-[14px] text-ink-3">None finished yet.</p> : null}
            <ul className="list-disc pl-5 text-[14px] space-y-1">{finished.map((m) => <li key={String(m.id)}><Link className="underline" href={`/counselor/mock/${m.id}`}>{String(m.country_key).toUpperCase()} on {when(m.finished_at, { day: "numeric", month: "short", year: "numeric" })}</Link>: {Number(m.score)}%</li>)}</ul>
          </section>

          <section className={box} aria-labelledby="nt-h"><h2 id="nt-h" className="text-[18px] font-semibold text-ink mb-1">Internal notes</h2>
            <p className="text-[13px] text-ink-4 mb-3">Staff only. The student never sees these.</p>
            <form action={studentAction} className="mb-4"><Hidden sid={sid} act="note" />
              <label className="sr-only" htmlFor="nb">Note</label><textarea id="nb" name="body" rows={3} maxLength={1000} required className={`${field} w-full mb-2`} />
              <button className={btnDark} type="submit">Save note</button></form>
            <ul className="space-y-2.5">{notes.map((n) => <li key={String(n.id)} className="text-[14px] border-l-2 border-black/[0.1] pl-3"><b>{String(n.author ?? "")}</b> <small className="text-ink-4">{when(n.created_at)}</small><br /><span className="whitespace-pre-line">{String(n.body)}</span></li>)}</ul>
          </section>
        </div>

        <div>
          <section className={box} aria-labelledby="dc-h"><h2 id="dc-h" className="text-[18px] font-semibold text-ink mb-3">Documents</h2>
            {!docs.length ? <p className="text-[14px] text-ink-3">Nothing uploaded yet.</p> : null}
            {docs.map((d) => (
              <article key={d.id} className="py-3 border-t first:border-t-0 border-black/[0.07]">
                <div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-[15px] font-semibold text-ink">{VT.TYPES[d.doc_type] ?? d.doc_type} <span className={`ml-1 px-2 py-0.5 rounded-full text-[12px] ${pill(d.status)}`}>{d.status}</span></h3>
                  <p className="text-[13px] text-ink-3">{d.original_name} &middot; {Math.round(d.size / 1024)} KB &middot; scan: {d.scan_status}</p></div>
                  <DocLink id={d.id} viewer={me.id} label={VT.TYPES[d.doc_type] ?? d.doc_type} /></div>
                {d.status === "uploaded" ? (
                  <form action={studentAction} className="flex flex-wrap gap-2 items-center mt-2"><Hidden sid={sid} id={d.id} />
                    <label className="sr-only" htmlFor={`da${d.id}`}>Decision</label><select id={`da${d.id}`} name="act" className={field}><option value="doc_verify">Verify</option><option value="doc_reject">Reject (needs a reason)</option></select>
                    <label className="sr-only" htmlFor={`r${d.id}`}>Reason if rejecting</label><input id={`r${d.id}`} name="reason" maxLength={255} placeholder="Reason (required to reject)" className={`${field} flex-1 min-w-[10rem]`} />
                    <button className={btnDark} type="submit">Save</button></form>
                ) : null}
              </article>
            ))}
          </section>

          <section className={box} aria-labelledby="ap-h"><h2 id="ap-h" className="text-[18px] font-semibold text-ink mb-3">Applications</h2>
            {!apps.length ? <p className="text-[14px] text-ink-3">No applications yet.</p> : null}
            {apps.map((a) => (
              <article key={a.id} className="py-3 border-t first:border-t-0 border-black/[0.07]">
                <h3 className="text-[15px] font-semibold text-ink">{a.uni_name}</h3><p className="text-[13px] text-ink-3">{a.program} &middot; {a.intake} &middot; {a.status.replace("_", " ")}</p>
                {["in_review", "applied", "offer"].includes(a.status) ? (
                  <form action={studentAction} className="flex flex-wrap gap-2 items-center mt-2"><Hidden sid={sid} id={a.id} />
                    <label className="sr-only" htmlFor={`aa${a.id}`}>Next step</label>
                    <select id={`aa${a.id}`} name="act" className={field}>
                      {a.status === "in_review" ? <><option value="to_applied">Mark applied (dispatch)</option><option value="to_draft">Return to student</option></> : null}
                      {a.status === "applied" ? <><option value="to_offer">Record offer</option><option value="to_declined">Close (no offer)</option></> : null}
                      {a.status === "offer" ? <option value="to_declined">Withdraw offer</option> : null}
                    </select>
                    {a.status === "applied" ? <><label className="sr-only" htmlFor={`o${a.id}`}>Offer type</label><select id={`o${a.id}`} name="offer_type" className={field}><option value="conditional">Conditional offer</option><option value="unconditional">Unconditional offer</option></select></> : null}
                    <label className="sr-only" htmlFor={`n${a.id}`}>Note to student</label><input id={`n${a.id}`} name="note" maxLength={255} placeholder="Note (required to return a draft; shown on offers)" className={`${field} flex-1 min-w-[10rem]`} />
                    <button className={btnDark} type="submit">Save</button></form>
                ) : null}
              </article>
            ))}
          </section>

          <section className={box} aria-labelledby="hs-h"><h2 id="hs-h" className="text-[18px] font-semibold text-ink mb-3">Recent activity</h2>
            <ul className="space-y-1.5 text-[14px]">{hist.map((x) => <li key={String(x.id)}>{x.from_status ? `${String(x.from_status)} to ${String(x.to_status)}` : String(x.to_status)} <small className="text-ink-4">by {x.actor ?? "system"} &middot; {when(x.created_at)}</small></li>)}</ul>
          </section>
        </div>
      </div>
    </ConsolePage>
  );
}

async function DocLink({ id, viewer, label }: { id: number; viewer: number; label: string }) {
  return <a className={`${btnLine} inline-flex items-center self-start`} href={await VT.link(id, viewer)} target="_blank" rel="noopener noreferrer">Open file<span className="sr-only"> ({label})</span></a>;
}
