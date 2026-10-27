import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/portal/guard";
import { evidenceGaps } from "@/lib/journey/engine";
import * as DC from "@/lib/journey/docs";
import { actorFor, buildView } from "@/lib/journey/service";
import { evidenceFor, events, loadTask, packageLevel } from "@/lib/journey/store";
import { DOC_KEYS } from "@/lib/journey/types";
import { JourneyFlash as Flash } from "@/components/journey/flash";
import { attachDocAction, evidenceAction, requestNaAction, taskMoveAction, uploadAction } from "@/app/abroad/journey-actions";
import { btnGhost, btnPrimary, day, DueText, input, label, PriorityTag, StatusBadge, when } from "@/components/journey/parts";
import { PortalPage } from "@/components/portal/shell";

export const metadata: Metadata = { title: "Task | GrowQR" };
export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser("student");
  const id = parseInt((await params).id, 10) || 0;
  const lt = id ? await loadTask(id) : null;
  if (!lt || !actorFor({ id: me.id, role: "student" }, lt.loaded.c)) notFound();
  const { task, loaded } = lt;
  const view = buildView(loaded, await packageLevel(me.id), new Date());
  const v = view.tasks.find((x) => x.task.id === id);
  if (!v) notFound();
  const ev = await evidenceFor(id);
  const hist = (await events(loaded.c.id, { taskId: id, limit: 12 })).filter((e) => !["na.system"].includes(String(e.kind)) || true);
  const app = loaded.apps.find((a) => a.id === task.applicationId);
  const gapsComplete = evidenceGaps(task.evidenceReq, ev, task.review === "consultant" ? "submit" : "complete");
  const open = !["completed", "not_applicable"].includes(task.status);
  const mine = task.owner === "student" && !v.ent.locked && open;
  const blocked = v.effective === "blocked";
  const canWork = mine && !blocked && task.status !== "submitted_for_review" && task.status !== "blocked";
  const started = ["in_progress", "changes_requested", "waiting_on_student", "waiting_on_university"].includes(task.status);
  const feedback = hist.find((e) => e.kind === "status" && e.to_status === "changes_requested");
  const back = `/abroad/journey/task/${id}`;
  const docs = (await DC.listDocs(loaded.c.id, { latestOnly: true }));
  const links = new Map<number, string>();
  for (const e of ev) if (e.docId && !links.has(e.docId)) { const l = await DC.link(e.docId, { id: me.id, role: "student" }); if (l) links.set(e.docId, l); }
  const dependents = loaded.deps.filter((d) => d.dependsOn === id).map((d) => loaded.byId.get(d.taskId)).filter((x) => x && !x.obsolete);

  return (
    <PortalPage user={me} active="journey" title={task.title} subtitle={<Link href={`/abroad/journey#t${id}`} className="underline">← Back to my journey</Link>} wide>
      <Flash />
      <section aria-labelledby="sum" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-6 mb-5">
        <h2 id="sum" className="sr-only">Summary</h2>
        <p className="flex flex-wrap items-center gap-3 text-[14px]"><StatusBadge status={v.effective} /><PriorityTag p={task.priority} />
          <span className="text-ink-3">Owner: <b className="text-ink">{task.owner === "student" ? "You" : task.owner === "consultant" ? "Your consultant" : "The university"}</b></span><DueText v={v} />
          {app ? <span className="text-ink-3">University: <b className="text-ink">{app.uniName}</b> ({app.programme}, {app.intake})</span> : null}</p>
        <p className="mt-3 text-[15px] text-ink-2">{task.description}</p>
        <p className="mt-3 rounded-lg bg-cream-2 px-3 py-2 text-[14px] text-ink-2"><b>How we know it is done:</b> {task.criteria}</p>
        {task.review === "consultant" ? <p className="mt-2 text-[13px] text-ink-3">Your consultant checks this one. You send it for review; it is complete only when they approve it.</p> : null}
        {v.ent.locked ? <p className="mt-3 text-[14px]"><span aria-hidden="true">🔒</span> This service is included in <b>{v.ent.needs}</b>. <Link className="underline" href="/abroad/packages">See packages</Link>. Your own steps and critical deadlines are never hidden.</p> : null}
        {task.minLevel && task.owner === "student" && view.level < task.minLevel ? <p className="mt-2 text-[13px] text-ink-3">Expert help with this step is part of a higher package. You can still do it yourself.</p> : null}
      </section>

      {blocked ? (
        <section aria-labelledby="blk" className="rounded-2xl border border-red-200 bg-red-50 p-5 mb-5">
          <h2 id="blk" className="text-[17px] font-semibold text-red-900">Why you can&apos;t start yet</h2>
          <p className="text-[14px] text-red-900 mt-1">{v.block.reason}</p>
          <ul className="mt-2 space-y-1 text-[14px] text-red-900">{v.block.blockers.map((b) => <li key={b.taskId}><Link className="underline" href={`/abroad/journey/task/${b.taskId}`}>{b.title}</Link>: {b.howToUnblock}</li>)}</ul>
          {v.block.kind === "manual" ? <p className="mt-2 text-[14px] text-red-900">Your consultant will unblock this when it is resolved.</p> : null}
        </section>
      ) : null}
      {task.status === "changes_requested" && feedback ? <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"><b>Your consultant asked for changes:</b> {String(feedback.note)}</div> : null}
      {task.status === "waiting_on_student" ? <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"><b>We need something from you.</b> {String(hist.find((e) => e.to_status === "waiting_on_student")?.note ?? "")}</div> : null}
      {task.naRequestedBy !== null && task.status !== "not_applicable" ? <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px]">Marked “not applicable” and waiting for approval: {task.naReason}</div> : null}

      <section aria-labelledby="req" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-6 mb-5">
        <h2 id="req" className="text-[18px] font-semibold text-ink mb-3">What this step needs</h2>
        <ul className="space-y-1.5 mb-4">{task.evidenceReq.map((r, i) => {
          const met = !evidenceGaps([r], ev, task.review === "consultant" ? "submit" : "complete").length;
          return <li key={i} className="flex gap-2 text-[15px]"><span aria-hidden="true" className={met ? "text-emerald-600" : "text-ink-4"}>{met ? "✓" : "○"}</span><span className={met ? "text-ink-2" : "text-ink"}>{r.label}<span className="sr-only">{met ? " (provided)" : " (still needed)"}</span></span></li>;
        })}</ul>
        {ev.length ? (
          <>
            <h3 className="text-[14px] font-semibold text-ink-2">Provided so far</h3>
            <ul className="mt-1 divide-y divide-black/[0.07] text-[14px]">{ev.map((e) => (
              <li key={e.id} className="py-2">
                {e.kind === "document" ? <>Document <b>{DOC_KEYS[e.docKey ?? ""]?.label}</b> v{e.docVersion}{e.docName ? ` (${e.docName})` : ""} · <span className="capitalize">{e.docStatus}</span>{e.docId && links.get(e.docId) ? <> · <a className="underline" href={links.get(e.docId)} target="_blank" rel="noopener noreferrer">Open</a></> : null}</> : e.kind === "link" ? <>Link: <a className="underline break-all" href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url}</a></> : <>{e.kind === "confirmation" ? "Confirmation" : "Note"}: {e.text}</>}
                <span className="text-ink-4"> · {e.byRole === "system" ? "checked automatically" : e.byRole} · {when(e.at)}</span>
              </li>))}</ul>
          </>
        ) : null}
      </section>

      {canWork ? (
        <section aria-labelledby="do" className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 sm:p-6 mb-5">
          <h2 id="do" className="text-[18px] font-semibold text-ink mb-3">Do this step</h2>
          {!started ? (
            <form action={taskMoveAction}><input type="hidden" name="task_id" value={id} /><input type="hidden" name="to" value="in_progress" />
              <button className={btnPrimary} type="submit">Start this step</button></form>
          ) : (
            <div className="space-y-5">
              {task.evidenceReq.map((r, i) => (
                <div key={i}>
                  {r.kind === "document" ? (
                    <div><h3 className="text-[15px] font-semibold text-ink">{r.label}</h3>
                      <form action={uploadAction} encType="multipart/form-data" className="mt-2 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="doc_key" value={r.docKey} /><input type="hidden" name="task_id" value={id} /><input type="hidden" name="application_id" value={task.applicationId ?? ""} /><input type="hidden" name="back" value={back} />
                        <div><label className={label} htmlFor={`f${i}`}>File (PDF, JPG, PNG or DOCX, up to 8 MB)</label><input id={`f${i}`} type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.docx" className={input} /></div>
                        {r.docKey && DOC_KEYS[r.docKey]?.expires ? <div><label className={label} htmlFor={`e${i}`}>Expiry date (if shown)</label><input id={`e${i}`} type="date" name="expires_on" className={input} /></div> : null}
                        <button className={btnPrimary} type="submit">Upload as a new version</button>
                      </form>
                      {docs.filter((d) => d.docKey === r.docKey && (d.applicationId ?? null) === (task.applicationId ?? null) && !ev.some((e) => e.docId === d.id)).map((d) => (
                        <form key={d.id} action={attachDocAction} className="mt-2"><input type="hidden" name="task_id" value={id} /><input type="hidden" name="doc_id" value={d.id} />
                          <button className={btnGhost} type="submit">Use my existing file: {d.name} (v{d.version})</button></form>))}
                    </div>
                  ) : (
                    <form action={evidenceAction}>
                      <input type="hidden" name="task_id" value={id} /><input type="hidden" name="kind" value={r.kind} />
                      <label className={label} htmlFor={`v${i}`}>{r.label}</label>
                      {r.kind === "link" ? <input id={`v${i}`} name="value" type="url" placeholder="https://" className={input} required /> : <textarea id={`v${i}`} name="value" rows={2} maxLength={2000} className={input + " min-h-[88px]"} required />}
                      <button className={btnGhost + " mt-2"} type="submit">Save {r.kind === "link" ? "link" : "answer"}</button>
                    </form>
                  )}
                </div>
              ))}
              <form action={taskMoveAction} className="border-t border-black/[0.07] pt-4">
                <input type="hidden" name="task_id" value={id} />
                <label className={label} htmlFor="note">{task.review === "consultant" ? "Note for your consultant (optional)" : "What you did, and when (required)"}</label>
                <textarea id="note" name="note" rows={2} maxLength={500} className={input + " min-h-[72px]"} required={task.review !== "consultant"} />
                {gapsComplete.length ? <p className="mt-2 text-[13px] text-amber-900">Still needed: {gapsComplete.map((g) => g.label).join("; ")}.</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button name="to" value={task.review === "consultant" ? "submitted_for_review" : "completed"} className={btnPrimary} type="submit">{task.review === "consultant" ? "Submit for review" : "Mark as done"}</button>
                  {task.external ? <button name="to" value="waiting_on_university" className={btnGhost} type="submit" formNoValidate={false}>I&apos;m waiting for someone else</button> : null}
                </div>
                <p className="mt-2 text-[12px] text-ink-4">A step is only marked done when the evidence above is on file. Opening a page or pressing a button alone never completes it.</p>
              </form>
            </div>
          )}
        </section>
      ) : null}
      {task.status === "waiting_on_university" && mine ? (
        <form action={taskMoveAction} className="mb-5 bg-white rounded-2xl border border-black/[0.08] p-5"><input type="hidden" name="task_id" value={id} /><input type="hidden" name="to" value="in_progress" /><input type="hidden" name="note" value="Reply received" />
          <p className="text-[14px] text-ink-2 mb-2">You are waiting for someone else on this step. This is not counted as your delay.</p><button className={btnGhost} type="submit">I got a reply: continue</button></form>
      ) : null}
      {!mine && open && !v.ent.locked && !blocked ? <p className="mb-5 rounded-xl bg-cream-2 px-4 py-3 text-[14px] text-ink-2">{task.owner === "consultant" ? "Your consultant handles this step." : "The university acts on this step; your consultant records the result."} {task.status === "submitted_for_review" ? "It is with your consultant for review." : ""}</p> : null}

      {mine && !blocked && task.naRequestedBy === null && !task.auto ? (
        <details className="mb-5 bg-white rounded-2xl border border-black/[0.08] p-4">
          <summary className="cursor-pointer min-h-[44px] flex items-center text-[14px] font-medium text-ink-2">This step does not apply to me</summary>
          <form action={requestNaAction} className="mt-2"><input type="hidden" name="task_id" value={id} />
            <label className={label} htmlFor="reason">Why does it not apply? Your consultant must approve this.</label>
            <textarea id="reason" name="reason" rows={2} maxLength={255} required className={input + " min-h-[72px]"} />
            <button className={btnGhost + " mt-2"} type="submit">Ask my consultant to approve</button></form>
        </details>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-black/[0.08] p-5"><h2 className="text-[16px] font-semibold text-ink mb-2">Depends on</h2>
          {loaded.deps.filter((d) => d.taskId === id).length ? <ul className="text-[14px] space-y-1">{loaded.deps.filter((d) => d.taskId === id).map((d) => { const x = loaded.byId.get(d.dependsOn); return x ? <li key={d.dependsOn}><Link className="underline" href={`/abroad/journey/task/${x.id}`}>{x.title}</Link> · {x.status.replace(/_/g, " ")}</li> : null; })}</ul> : <p className="text-[14px] text-ink-3">Nothing: you can start any time.</p>}
          {dependents.length ? <><h3 className="text-[14px] font-semibold text-ink-2 mt-3">This unlocks</h3><ul className="text-[14px] text-ink-2 list-disc ml-5">{dependents.slice(0, 5).map((x) => <li key={x!.id}>{x!.title}</li>)}</ul></> : null}</section>
        <section className="bg-white rounded-2xl border border-black/[0.08] p-5"><h2 className="text-[16px] font-semibold text-ink mb-2">History</h2>
          <ul className="text-[13px] text-ink-2 space-y-1.5">{hist.map((e) => <li key={String(e.id)}><b>{String(e.kind).replace(".", " ")}</b>{e.to_status ? ` → ${String(e.to_status).replace(/_/g, " ")}` : ""} {e.note ? `· ${String(e.note).slice(0, 140)}` : ""}<br /><span className="text-ink-4">{when(String(e.created_at))}{e.actor ? ` · ${e.actor}` : ""}</span></li>)}</ul>
          <p className="mt-2 text-[12px] text-ink-4">Created {day(task.createdAt)}. Template {task.templateKey} v{task.templateVersion}.</p></section>
      </div>
    </PortalPage>
  );
}
