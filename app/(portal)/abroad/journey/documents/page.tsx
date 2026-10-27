import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/portal/guard";
import * as DC from "@/lib/journey/docs";
import { caseOfUser, loadCase } from "@/lib/journey/store";
import { DOC_KEYS } from "@/lib/journey/types";
import { JourneyFlash as Flash } from "@/components/journey/flash";
import { uploadAction } from "@/app/abroad/journey-actions";
import { btnPrimary, day, input, label } from "@/components/journey/parts";
import { Card, PortalPage } from "@/components/portal/shell";

export const metadata: Metadata = { title: "My documents | GrowQR" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { uploaded: "Waiting for your consultant", verified: "Verified", rejected: "Needs a new version", expired: "Expired: upload a new version", superseded: "Replaced by a newer version" };

export default async function JourneyDocuments() {
  const me = await requireUser("student");
  const c = await caseOfUser(me.id);
  if (!c) redirect("/abroad/journey");
  const [docs, loaded] = await Promise.all([DC.listDocs(c.id), loadCase(c.id)]);
  const who = { id: me.id, role: "student" as const };
  const groups = new Map<string, typeof docs>();
  for (const d of docs) groups.set(`${d.docKey}|${d.applicationId ?? 0}`, [...(groups.get(`${d.docKey}|${d.applicationId ?? 0}`) ?? []), d]);
  const links = new Map<number, string>();
  for (const d of docs) { const l = await DC.link(d.id, who); if (l) links.set(d.id, l); }
  const apps = loaded?.apps ?? [];
  return (
    <PortalPage user={me} active="journey" title="My documents" subtitle={<Link className="underline" href="/abroad/journey">← Back to my journey</Link>} wide>
      <Flash />
      <Card title="Upload a document">
        <form action={uploadAction} encType="multipart/form-data" className="grid sm:grid-cols-2 gap-4 items-end">
          <input type="hidden" name="back" value="/abroad/journey/documents" />
          <div><label className={label} htmlFor="doc_key">Document type</label><select id="doc_key" name="doc_key" required className={input}>{Object.entries(DOC_KEYS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label className={label} htmlFor="application_id">For which university (leave blank for all)</label><select id="application_id" name="application_id" className={input}><option value="">All / general</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.uniName} ({a.programme})</option>)}</select></div>
          <div><label className={label} htmlFor="file">File (PDF, JPG, PNG or DOCX, up to 8 MB)</label><input id="file" type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.docx" className={input} /></div>
          <div><label className={label} htmlFor="expires_on">Expiry date (passport, test scores, bank statements)</label><input id="expires_on" type="date" name="expires_on" className={input} /></div>
          <div className="sm:col-span-2"><button className={btnPrimary} type="submit">Upload as a new version</button>
            <p className="mt-2 text-[12px] text-ink-4">Uploading again never replaces the old file: it becomes the next version and the earlier ones stay in the history. Files are private and can only be opened by you, your consultant and administrators.</p></div>
        </form>
      </Card>
      {!docs.length ? <p className="text-[15px] text-ink-3">No documents yet. Your tasks tell you exactly which ones each step needs.</p> : null}
      {[...groups.entries()].map(([k, vs]) => {
        const [key, appId] = k.split("|");
        const app = apps.find((a) => a.id === Number(appId));
        return (
          <section key={k} className="bg-white rounded-2xl border border-black/[0.08] shadow-card p-5 mb-4" aria-labelledby={`g${k.replace("|", "-")}`}>
            <h2 id={`g${k.replace("|", "-")}`} className="text-[17px] font-semibold text-ink">{DOC_KEYS[key]?.label ?? key}{app ? <span className="text-ink-3 font-normal"> · {app.uniName}</span> : null} {DOC_KEYS[key]?.restricted ? <span className="ml-1 rounded bg-cream-3 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">Private: you and your consultant only</span> : null}</h2>
            <ul className="mt-2 divide-y divide-black/[0.07]">{vs.map((d) => (
              <li key={d.id} className="py-2 text-[14px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <b className="text-ink">Version {d.version}</b><span className="text-ink-2">{d.name}</span><span className={d.status === "verified" ? "text-emerald-700 font-medium" : d.status === "rejected" || d.status === "expired" ? "text-red-700 font-medium" : "text-ink-3"}>{STATUS[d.status]}</span>
                {d.rejectReason && d.status === "rejected" ? <span className="text-red-800">Reason: {d.rejectReason}</span> : null}
                {d.expiresOn ? <span className="text-ink-3">Expires {day(d.expiresOn)}</span> : null}<span className="text-ink-4">Uploaded {day(d.createdAt)}</span>
                {links.get(d.id) ? <a className="underline" href={links.get(d.id)} target="_blank" rel="noopener noreferrer">Open<span className="sr-only"> version {d.version}</span></a> : null}
              </li>))}</ul>
          </section>
        );
      })}
    </PortalPage>
  );
}
