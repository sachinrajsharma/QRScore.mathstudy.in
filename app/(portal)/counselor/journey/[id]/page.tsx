import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMfaIfStaff, requireUser } from "@/lib/portal/guard";
import { one } from "@/lib/portal/db";
import { appProgress } from "@/lib/journey/apps";
import * as DC from "@/lib/journey/docs";
import { evidenceGaps } from "@/lib/journey/engine";
import * as EX from "@/lib/journey/exceptions";
import { STAGES } from "@/lib/journey/default-template";
import { actorFor, viewCase, type TaskView } from "@/lib/journey/service";
import { consultantOf, evidenceFor, events, getCase, type AppRow } from "@/lib/journey/store";
import * as WS from "@/lib/journey/workspace";
import { DOC_KEYS } from "@/lib/journey/types";
import { box, btnDark, btnLine, ConsolePage, field } from "@/components/admin/console-page";
import { Bar, DueText, PriorityTag, StatusBadge, when, day } from "@/components/journey/parts";
import { JourneyFlash } from "@/components/journey/flash";
import { addAppAction, assignAction, carryOverAction, commAction, docReviewAction, evidenceAction, exceptionAction, moveAction, naAction, reminderAction, termsAction, uploadAction } from "../actions";

export const metadata: Metadata = { title: "Journey case | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const smallBtn = "min-h-[40px] px-3 rounded-lg border border-black/[0.15] text-[13px] font-medium hover:bg-cream-2";

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser("counselor", "admin");
  const id = parseInt((await params).id, 10) || 0;
  await requireMfaIfStaff(me, `/counselor/journey/${id}`);
  const who = { id: me.id, role: me.role as "counselor" | "admin" };
  const c = id ? await getCase(id) : null;
  if (!c || !actorFor(who, c)) notFound();
  const [v, student, docs, ex, comms, reminders, hand, tl, consultant, prog, accessLog, cons] = await Promise.all([
    viewCase(id), one<R>("SELECT name, email FROM users WHERE id = $1", [c.userId]), DC.listDocs(id), EX.pending(id), WS.commLog(id), WS.reminders(id, me.id), WS.handovers(id), events(id, { limit: 25 }),
    consultantOf(c.consultantId), appProgress(id), DC.accessLog(id, 8), me.role === "admin" || c.consultantId === me.id ? WS.consultants() : Promise.resolve([]),
  ]);
  if (!v || !student) notFound();
  const apps = v.loaded.apps;
  const appName = (aid: number | null) => apps.find((a) => a.id === aid)?.uniName;
  const links = new Map<number, string>();
  for (const d of docs) { const l = await DC.link(d.id, who); if (l) links.set(d.id, l); }
  const evMap = new Map<number, Awaited<ReturnType<typeof evidenceFor>>>();
  for (const t of v.tasks) if (t.task.status !== "not_started" || t.task.evidenceReq.length) evMap.set(t.task.id, []);
  // Evidence is loaded for tasks someone is working on; the rest show their requirements only.
  for (const t of v.tasks.filter((x) => !["not_started", "ready_to_start"].includes(x.task.status))) evMap.set(t.task.id, await evidenceFor(t.task.id));
  const byStage = new Map<number, TaskView[]>();
  for (const t of v.tasks) byStage.set(t.task.stage, [...(byStage.get(t.task.stage) ?? []), t]);
  const queue = v.tasks.filter((t) => t.task.status === "submitted_for_review");
  const firstOpen = [...v.progress.stages].find((s) => s.done < s.total)?.stage ?? 1;
  const latestDocs = docs.filter((d) => !docs.some((x) => x.docKey === d.docKey && (x.applicationId ?? 0) === (d.applicationId ?? 0) && x.version > d.version));
  const canAssign = me.role === "admin" || c.consultantId === me.id;

  return (
    <ConsolePage me={me} tab="journey-ws" plain title={student.name} subtitle={`${c.destination.toUpperCase()} · ${c.degree} · ${c.intake} · journey ${c.status}`}>
      <JourneyFlash />
      <p className="mb-4"><Link className="underline text-[14px]" href="/counselor/journey">← Journey workspace</Link></p>
      <section className={box} aria-labelledby="sm-h">
        <h2 id="sm-h" className="sr-only">Summary</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><p className="text-[15px] text-ink-2"><b>{v.progress.pct}%</b> complete ({v.progress.done}/{v.progress.total} steps) · package level {v.level || "none"} · <a className="underline" href={`mailto:${student.email}`}>{student.email}</a></p><div className="mt-2"><Bar pct={v.progress.pct} label="Overall progress" /></div>
            <p className="mt-2 text-[14px] text-ink-2">Overdue: <b>{v.counts.overdueAll}</b> ({v.counts.overdueStudent} on the student, {v.counts.overdueAll - v.counts.overdueStudent} elsewhere) · awaiting review: <b>{v.counts.awaitingReview}</b> · waiting on university: <b>{v.counts.waitingUniversity}</b> · blocked: <b>{v.counts.blocked}</b></p>
            {v.risk.level !== "none" ? <p className={`mt-2 rounded-lg px-3 py-2 text-[14px] ${v.risk.level === "high" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}><b>{v.risk.level === "high" ? "High risk" : "Watch"}:</b> {v.risk.reasons.join("; ")}</p> : null}</div>
          <div><p className="text-[14px] text-ink-2">Consultant: <b>{consultant?.name ?? "Unassigned"}</b></p>
            {canAssign ? <form action={assignAction} className="mt-2 space-y-2"><input type="hidden" name="case_id" value={id} />
              <label className="sr-only" htmlFor="to">New consultant</label><select id="to" name="to" className={`${field} w-full`} defaultValue=""><option value="" disabled>Reassign to…</option>{cons.filter((x) => x.id !== c.consultantId).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.cases} cases)</option>)}</select>
              <label className="sr-only" htmlFor="rs">Reason for handover</label><input id="rs" name="reason" required minLength={5} placeholder="Reason for the handover" className={`${field} w-full`} /><button className={btnLine} type="submit">Reassign</button></form> : null}</div>
        </div>
      </section>

      {queue.length ? <section className={box} aria-labelledby="rv-h"><h2 id="rv-h" className="text-[18px] font-semibold text-ink mb-2">Waiting for your review ({queue.length})</h2>
        <ul className="text-[14px] space-y-1">{queue.map((t) => <li key={t.task.id}><a className="underline" href={`#t${t.task.id}`}>{t.task.title}</a>{appName(t.task.applicationId) ? ` · ${appName(t.task.applicationId)}` : ""} <span className="text-ink-3">submitted {when(t.task.submittedAt)}</span></li>)}</ul></section> : null}

      <h2 className="text-[20px] font-bold text-ink mb-3">Tasks</h2>
      <div className="space-y-3 mb-6">
        {STAGES.filter((s) => byStage.has(s.no)).map((s) => {
          const st = v.progress.stages.find((x) => x.stage === s.no);
          return (
            <details key={s.no} open={s.no === firstOpen || (byStage.get(s.no) ?? []).some((t) => t.task.status === "submitted_for_review")} className="bg-white rounded-2xl border border-black/[0.08] shadow-card">
              <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center gap-3 min-h-[44px]"><span className="flex-1 text-[16px] font-semibold text-ink">{s.track ? "Track" : `Stage ${s.no}`}: {s.name}</span><span className="text-[13px] text-ink-3">{st ? `${st.done}/${st.total} (${st.pct}%)` : "0"}</span></summary>
              <ul className="px-4 pb-3">{(byStage.get(s.no) ?? []).map((t) => <StaffTask key={t.task.id} v={t} caseId={id} ev={evMap.get(t.task.id) ?? []} appName={appName(t.task.applicationId)} links={links} docs={latestDocs} apps={apps} isAdmin={me.role === "admin"} meId={me.id} />)}</ul>
            </details>
          );
        })}
      </div>

      <section id="docs" className={box} aria-labelledby="d-h"><h2 id="d-h" className="text-[18px] font-semibold text-ink mb-2">Documents</h2>
        {!docs.length ? <p className="text-[14px] text-ink-3">Nothing uploaded yet.</p> : (
          <ul className="divide-y divide-black/[0.07]">{latestDocs.map((d) => (
            <li key={d.id} className="py-3 text-[14px]">
              <p><b>{DOC_KEYS[d.docKey]?.label}</b>{d.applicationId ? ` · ${appName(d.applicationId)}` : ""} · v{d.version} · <span className="capitalize">{d.status}</span>{d.restricted ? <span className="ml-1 rounded bg-cream-3 px-1.5 text-[11px]">restricted</span> : null} · {d.name} · {Math.round(d.size / 1024)} KB · {day(d.createdAt)}{d.expiresOn ? ` · expires ${day(d.expiresOn)}` : ""}
                {links.get(d.id) ? <> · <a className="underline" href={links.get(d.id)} target="_blank" rel="noopener noreferrer">Open</a></> : null}</p>
              {d.status === "rejected" && d.rejectReason ? <p className="text-red-800">Rejected: {d.rejectReason}</p> : null}
              {["uploaded", "rejected", "verified"].includes(d.status) ? (
                <form action={docReviewAction} className="mt-1 flex flex-wrap gap-2 items-center"><input type="hidden" name="case_id" value={id} /><input type="hidden" name="doc_id" value={d.id} />
                  <label className="sr-only" htmlFor={`dr${d.id}`}>Reason if rejecting</label><input id={`dr${d.id}`} name="reason" placeholder="Reason (required to reject)" maxLength={255} className={`${field} flex-1 min-w-[12rem]`} />
                  {d.status !== "verified" ? <button name="decision" value="verify" className={btnDark} type="submit">Verify</button> : null}<button name="decision" value="reject" className={btnLine} type="submit">Reject</button></form>) : null}
              {docs.filter((x) => x.docKey === d.docKey && (x.applicationId ?? 0) === (d.applicationId ?? 0) && x.version < d.version).length ? <details className="mt-1"><summary className="cursor-pointer text-ink-3 text-[13px]">Earlier versions</summary>
                <ul className="ml-4 text-[13px] text-ink-3">{docs.filter((x) => x.docKey === d.docKey && (x.applicationId ?? 0) === (d.applicationId ?? 0) && x.version < d.version).map((x) => <li key={x.id}>v{x.version} · {x.status} · {x.name} · {day(x.createdAt)}{links.get(x.id) ? <> · <a className="underline" href={links.get(x.id)} target="_blank" rel="noopener noreferrer">Open</a></> : null}</li>)}</ul></details> : null}
            </li>))}</ul>)}
        {accessLog.length ? <details className="mt-3"><summary className="cursor-pointer text-[13px] text-ink-3">Who opened files recently</summary><ul className="text-[13px] text-ink-3 ml-4">{accessLog.map((a) => <li key={String(a.id)}>{String(a.viewer)} ({String(a.viewer_role)}) opened document #{String(a.doc_id)} · {when(String(a.created_at))}</li>)}</ul></details> : null}
      </section>

      <section id="apps" className={box} aria-labelledby="a-h"><h2 id="a-h" className="text-[18px] font-semibold text-ink mb-2">Applications</h2>
        {!apps.length ? <p className="text-[14px] text-ink-3">No universities yet.</p> : (
          <ul className="divide-y divide-black/[0.07]">{apps.map((a) => { const p = prog.get(a.id); return (
            <li key={a.id} className="py-3 text-[14px]"><p><b>{a.uniName}</b> · {a.programme} · {a.intake} · <span className="capitalize">{a.category}</span> · <b className="capitalize">{a.status.replace("_", " ")}</b>{p ? ` · ${p.done}/${p.total} steps${p.overdue ? `, ${p.overdue} overdue` : ""}` : ""}</p>
              {a.closedReason ? <p className="text-ink-3">{a.closedReason}</p> : null}
              {["offer", "accepted"].includes(a.status) ? (
                <form action={termsAction} className="mt-1 grid grid-cols-2 lg:grid-cols-5 gap-2 items-end"><input type="hidden" name="case_id" value={id} /><input type="hidden" name="app_id" value={a.id} />
                  <input name="tuition" defaultValue={a.tuitionNote} placeholder="Tuition (from the letter)" aria-label="Tuition" className={field} /><input name="scholarship" defaultValue={a.scholarshipNote} placeholder="Scholarship" aria-label="Scholarship" className={field} />
                  <input name="deposit" defaultValue={a.depositAmount} placeholder="Deposit" aria-label="Deposit" className={field} /><input type="date" name="deadline" defaultValue={a.offerDeadline?.slice(0, 10) ?? ""} aria-label="Reply-by date" className={field} /><button className={btnLine} type="submit">Save offer terms</button></form>) : null}</li>); })}</ul>)}
        <form action={addAppAction} className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2 items-end"><input type="hidden" name="case_id" value={id} />
          <input name="uni_name" required placeholder="University" aria-label="University" className={field} /><input name="programme" required placeholder="Programme" aria-label="Programme" className={field} /><input name="intake" defaultValue={c.intake} aria-label="Intake" className={field} />
          <select name="category" aria-label="Category" className={field} defaultValue="target"><option value="ambitious">Ambitious</option><option value="target">Target</option><option value="safer">Safer</option></select><button className={btnDark} type="submit">Add university</button></form>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section id="comms" className={box} aria-labelledby="cm-h"><h2 id="cm-h" className="text-[18px] font-semibold text-ink mb-2">Notes, calls and emails</h2>
          <form action={commAction} className="grid grid-cols-2 gap-2 mb-3"><input type="hidden" name="case_id" value={id} />
            <select name="channel" aria-label="Channel" className={field}>{WS.CHANNELS.map((x) => <option key={x}>{x}</option>)}</select><select name="direction" aria-label="With" className={field}><option value="internal">Internal note</option><option value="student">With the student</option><option value="university">With a university</option></select>
            <input name="subject" placeholder="Subject" aria-label="Subject" className={`${field} col-span-2`} /><textarea name="body" required rows={3} placeholder="What was said or agreed" aria-label="Details" className={`${field} col-span-2`} />
            <select name="application_id" aria-label="About which university" className={`${field} col-span-2`}><option value="">Not about one university</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.uniName}</option>)}</select><button className={btnDark} type="submit">Log it</button></form>
          <ul className="divide-y divide-black/[0.07] text-[14px] max-h-80 overflow-y-auto">{comms.map((m) => <li key={String(m.id)} className="py-2"><b className="capitalize">{String(m.channel)}</b> · {String(m.direction)}{m.uni_name ? ` · ${m.uni_name}` : ""}{m.subject ? ` · ${m.subject}` : ""}<br />{String(m.body)}<br /><span className="text-ink-4 text-[12px]">{m.author} · {when(String(m.created_at))}</span></li>)}</ul></section>
        <section className={box} aria-labelledby="rm-h"><h2 id="rm-h" className="text-[18px] font-semibold text-ink mb-2">My reminders for this student</h2>
          <form action={reminderAction} className="flex flex-wrap gap-2 mb-3"><input type="hidden" name="case_id" value={id} /><input type="date" name="remind_on" required aria-label="Remind me on" className={field} /><input name="body" required placeholder="Remind me to…" aria-label="Reminder" className={`${field} flex-1 min-w-[10rem]`} /><button className={btnDark} type="submit">Set</button></form>
          <ul className="text-[14px] divide-y divide-black/[0.07]">{reminders.map((r) => <li key={String(r.id)} className="py-2 flex justify-between gap-2"><span className={r.done_at ? "text-ink-4 line-through" : ""}>{day(String(r.remind_on))}: {String(r.body)}</span>{!r.done_at ? <form action={reminderAction}><input type="hidden" name="case_id" value={id} /><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="act" value="done" /><button className={smallBtn} type="submit">Done</button></form> : null}</li>)}</ul>
          <h3 className="mt-4 text-[15px] font-semibold text-ink">Handover history</h3>
          {!hand.length ? <p className="text-[14px] text-ink-3">No handovers yet.</p> : <ul className="text-[13px] text-ink-2 mt-1 space-y-1">{hand.map((h) => <li key={String(h.id)}>{when(String(h.created_at))}: {String(h.from_name ?? "unassigned")} → <b>{String(h.to_name ?? "unassigned")}</b> by {String(h.by_name)} · {String(h.reason)}</li>)}</ul>}</section>
      </div>

      <section id="exceptions" className={box} aria-labelledby="x-h"><h2 id="x-h" className="text-[18px] font-semibold text-ink mb-2">Exceptions and recovery</h2>
        <p className="text-[13px] text-ink-3 mb-2">Nothing is deleted. Open steps are closed as not applicable with a reason, completed work stays, and recovery steps are added. No flow promises an outcome.</p>
        {ex.length ? <ul className="divide-y divide-black/[0.07] mb-3 text-[14px]">{ex.map((x) => (
          <li key={String(x.id)} className="py-2"><b>{EX.KIND_LABEL[x.kind as EX.ExKind]}</b> · <span className="capitalize">{String(x.status)}</span> · {String(x.reason)} <span className="text-ink-4">({String(x.requester)}, {when(String(x.created_at))})</span>
            {x.status === "requested" ? <form action={exceptionAction} className="mt-1 flex flex-wrap gap-2"><input type="hidden" name="case_id" value={id} /><input type="hidden" name="id" value={String(x.id)} /><input name="note" placeholder="Note (required to decline)" aria-label="Note" className={`${field} flex-1 min-w-[10rem]`} /><button name="act" value="apply" className={btnDark} type="submit">Apply</button><button name="act" value="decline" className={btnLine} type="submit">Decline</button></form> : null}</li>))}</ul> : null}
        <details><summary className="cursor-pointer min-h-[44px] flex items-center text-[14px] font-medium">Record an exception now</summary>
          <form action={exceptionAction} className="grid sm:grid-cols-2 gap-2 mt-2"><input type="hidden" name="case_id" value={id} /><input type="hidden" name="act" value="record" />
            <select name="kind" aria-label="Kind" className={field}>{EX.KINDS.map((k) => <option key={k} value={k}>{EX.KIND_LABEL[k]}</option>)}</select>
            <select name="application_id" aria-label="University" className={field}><option value="">No single university</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.uniName} ({a.status})</option>)}</select>
            <input name="new_intake" placeholder="New intake (deferral)" aria-label="New intake" className={field} /><input name="uni_name" placeholder="New university (change)" aria-label="New university" className={field} /><input name="programme" placeholder="New programme (change)" aria-label="New programme" className={field} />
            <textarea name="reason" required rows={2} placeholder="What happened" aria-label="What happened" className={`${field} sm:col-span-2`} /><div className="sm:col-span-2"><button className={btnDark} type="submit">Record and apply</button></div></form></details>
      </section>

      {c.legacy && me.role !== "student" ? (
        <section className={box} aria-labelledby="lg-h"><h2 id="lg-h" className="text-[18px] font-semibold text-ink mb-1">Carry over earlier progress</h2>
          <p className="text-[13px] text-ink-3 mb-2">This journey came from the earlier seven-card tracker. If you have seen proof that early stages are really done, confirm them here; each step is completed with your written confirmation. Nothing is carried over automatically.</p>
          <form action={carryOverAction} className="flex flex-wrap gap-2 items-end"><input type="hidden" name="case_id" value={id} /><label className="text-[13px]">Up to stage<select name="upto" className={`${field} ml-2`}>{[1, 2, 3, 4, 5].map((x) => <option key={x}>{x}</option>)}</select></label>
            <input name="note" required minLength={10} placeholder="What you checked (for example, documents seen)" aria-label="What you checked" className={`${field} flex-1 min-w-[14rem]`} /><button className={btnDark} type="submit">Confirm and carry over</button></form></section>
      ) : null}

      <section className={box} aria-labelledby="au-h"><h2 id="au-h" className="text-[18px] font-semibold text-ink mb-2">Audit trail</h2>
        <ul className="text-[13px] text-ink-2 space-y-1.5">{tl.map((e) => <li key={String(e.id)}><b>{String(e.kind)}</b>{e.to_status ? ` ${String(e.from_status).replace(/_/g, " ")} → ${String(e.to_status).replace(/_/g, " ")}` : ""} {e.note ? `· ${String(e.note).slice(0, 160)}` : ""} <span className="text-ink-4">· {when(String(e.created_at))}{e.actor ? ` · ${e.actor}` : e.actor_role === "system" ? " · system" : ""}</span></li>)}</ul></section>
    </ConsolePage>
  );
}

function StaffTask({ v, caseId, ev, appName, links, docs, apps, isAdmin, meId }: { v: TaskView; caseId: number; ev: Awaited<ReturnType<typeof evidenceFor>>; appName?: string; links: Map<number, string>; docs: Awaited<ReturnType<typeof DC.listDocs>>; apps: AppRow[]; isAdmin: boolean; meId: number }) {
  const t = v.task;
  const open = !["completed", "not_applicable"].includes(t.status);
  const gaps = evidenceGaps(t.evidenceReq, ev, "complete");
  const hidden = (
    <><input type="hidden" name="case_id" value={caseId} /><input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="application_id" value={t.applicationId ?? ""} /></>
  );
  return (
    <li id={`t${t.id}`} className="border-t border-black/[0.07] first:border-t-0">
      <details open={t.status === "submitted_for_review"}>
        <summary className="cursor-pointer list-none py-3 flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[44px]">
          <span className="text-[15px] font-medium text-ink">{t.title}</span><PriorityTag p={t.priority} />{appName ? <span className="rounded bg-cream-3 px-1.5 text-[12px] text-ink-3">{appName}</span> : null}
          {v.ent.locked ? <span className="rounded-full bg-cream-3 px-2 py-0.5 text-[12px]">🔒 {v.ent.needs}</span> : <StatusBadge status={v.effective} />}<span className="text-[13px] text-ink-3">{t.owner}</span><span className="text-[13px]"><DueText v={v} /></span>
          {v.naPending ? <span className="rounded bg-amber-100 px-1.5 text-[12px] text-amber-900">N/A requested</span> : null}
        </summary>
        <div className="pb-4 pl-1 text-[14px] space-y-3">
          <p className="text-ink-3">{t.criteria}</p>
          {v.effective === "blocked" ? <p className="text-red-800">{v.block.reason} {v.block.blockers.map((b) => b.howToUnblock).join(" ")}</p> : null}
          {t.blockedReason && t.status === "blocked" ? <p className="text-red-800">Blocked: {t.blockedReason}</p> : null}
          <div><b>Evidence</b><ul className="ml-4 list-disc">{t.evidenceReq.map((r, i) => <li key={i} className={evidenceGaps([r], ev, "complete").length ? "" : "text-emerald-800"}>{r.label}{evidenceGaps([r], ev, "complete").length ? " (missing)" : " ✓"}</li>)}</ul>
            {ev.length ? <ul className="mt-1 ml-4 text-[13px] text-ink-2">{ev.map((e) => <li key={e.id}>{e.kind === "document" ? <>{DOC_KEYS[e.docKey ?? ""]?.label} v{e.docVersion} <span className="capitalize">({e.docStatus})</span>{e.docId && links.get(e.docId) ? <> · <a className="underline" href={links.get(e.docId)} target="_blank" rel="noopener noreferrer">Open</a></> : null}</> : e.kind === "link" ? <a className="underline break-all" href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url}</a> : e.text} <span className="text-ink-4">· {e.byRole} · {when(e.at)}</span></li>)}</ul> : null}</div>
          {open && !v.ent.locked ? (
            <div className="space-y-2">
              {t.evidenceReq.filter((r) => r.kind !== "document").map((r, i) => (
                <form key={i} action={evidenceAction} className="flex flex-wrap gap-2 items-end">{hidden}<input type="hidden" name="kind" value={r.kind} />
                  <label className="text-[13px] text-ink-2 flex-1 min-w-[14rem]">{r.label}<input name="value" required className={`${field} w-full`} type={r.kind === "link" ? "url" : "text"} /></label><button className={smallBtn} type="submit">Add</button></form>))}
              {t.evidenceReq.filter((r) => r.kind === "document").map((r, i) => (
                <form key={i} action={uploadAction} encType="multipart/form-data" className="flex flex-wrap gap-2 items-end">{hidden}<input type="hidden" name="doc_key" value={r.docKey} />
                  <label className="text-[13px] text-ink-2">{r.label} (on the student&apos;s behalf)<input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.docx" className={`${field} w-full`} /></label><button className={smallBtn} type="submit">Upload</button></form>))}
              <form action={moveAction} className="space-y-2">{hidden}
                {t.taskKey === "s8a.offer_record" ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><select name="offer_type" aria-label="Offer type" className={field} defaultValue=""><option value="" disabled>Offer type…</option><option value="conditional">Conditional</option><option value="unconditional">Unconditional</option></select><input name="offer_conditions" placeholder="Conditions" aria-label="Conditions" className={field} /><input type="date" name="offer_deadline" aria-label="Reply by" className={field} /><input name="offer_deposit" placeholder="Deposit" aria-label="Deposit" className={field} /></div> : null}
                {t.taskKey === "s8.decision" ? <select name="application_id" aria-label="Accepted offer" className={field}>{apps.filter((a) => a.status === "offer").map((a) => <option key={a.id} value={a.id}>{a.uniName}</option>)}</select> : null}
                <label className="block text-[13px] text-ink-2">Note (what was done, or why){gaps.length && t.status === "submitted_for_review" ? ` · missing: ${gaps.map((g) => g.label).join("; ")}` : ""}<input name="note" className={`${field} w-full`} maxLength={500} /></label>
                <div className="flex flex-wrap gap-2">
                  {t.status === "submitted_for_review" ? <><button name="to" value="completed" className={btnDark} type="submit">Approve</button><button name="to" value="changes_requested" className={btnLine} type="submit">Request changes</button></>
                    : <><button name="to" value="completed" className={btnDark} type="submit">Mark complete</button>{t.status !== "in_progress" ? <button name="to" value="in_progress" className={btnLine} type="submit">Start / unblock</button> : null}</>}
                  <button name="to" value="waiting_on_student" className={smallBtn} type="submit">Waiting on student</button><button name="to" value="waiting_on_university" className={smallBtn} type="submit">Waiting on university</button><button name="to" value="blocked" className={smallBtn} type="submit">Blocked</button>
                </div>
              </form>
              {t.naRequestedBy !== null ? (
                <form action={naAction} className="flex flex-wrap gap-2 items-end rounded-lg bg-amber-50 p-2">{hidden}<span className="text-[13px] w-full">Not applicable requested: {t.naReason}</span><input name="reason" placeholder="Note (required to decline)" aria-label="Note" className={`${field} flex-1`} />
                  <button name="act" value="approve" className={btnDark} type="submit">Approve N/A</button><button name="act" value="decline" className={btnLine} type="submit">Decline</button></form>
              ) : !t.auto ? <details><summary className="cursor-pointer text-[13px] text-ink-3">Mark not applicable…</summary><form action={naAction} className="flex flex-wrap gap-2 mt-1">{hidden}<input type="hidden" name="act" value="request" /><input name="reason" required minLength={10} placeholder={isAdmin ? "Reason (another administrator must approve)" : "Reason (an administrator must approve)"} aria-label="Reason" className={`${field} flex-1`} /><button className={smallBtn} type="submit">Request</button></form></details> : null}
            </div>
          ) : null}
          {t.status === "completed" ? (
            <form action={moveAction} className="flex flex-wrap gap-2">{hidden}<input type="hidden" name="to" value="in_progress" /><input name="note" required minLength={5} placeholder="Why reopen?" aria-label="Reason to reopen" className={`${field} flex-1`} /><button className={smallBtn} type="submit">Reopen</button></form>
          ) : null}
          <p className="text-[12px] text-ink-4">Task #{t.id} · template {t.templateKey} v{t.templateVersion}{t.completedBy ? ` · completed by user ${t.completedBy === meId ? "(you)" : t.completedBy}` : ""}</p>
        </div>
      </details>
    </li>
  );
}
