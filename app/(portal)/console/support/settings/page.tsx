import type { Metadata } from "next";
import Link from "next/link";
import { ConsolePage, box, btnDark, btnLine, field } from "@/components/admin/console-page";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/support/model";
import { listBlocklist, listCategories, listTemplates } from "@/lib/support/store";
import { Flash, when } from "@/components/support/ui";
import { adminGate } from "../../gate";
import { categoryAction, templateAction, unblockAction } from "../actions";

export const metadata: Metadata = { title: "Support settings | GrowQR admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SupportSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await adminGate("/console/support/settings");
  const sp = await searchParams;
  const [cats, templates, blocklist] = await Promise.all([listCategories(), listTemplates(), listBlocklist()]);
  return (
    <ConsolePage me={me} tab="support" title="Support settings" subtitle="Categories, reply templates and blocked senders.">
      <p className="mb-4 text-[14px]"><Link href="/console/support" className="underline">Back to tickets</Link></p>
      <Flash ok={sp.ok} err={sp.e} />

      <section className={box} aria-labelledby="cats">
        <h2 id="cats" className="mb-1 text-[17px] font-semibold text-ink">Categories</h2>
        <p className="mb-3 text-[13.5px] text-ink-3">The default priority is given to new tickets in that category. Switching a category off hides it from the form; old tickets keep it.</p>
        <ul className="mb-4 divide-y divide-black/[0.07] text-[14.5px]">
          {cats.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span><b className={c.active ? "text-ink" : "text-ink-4 line-through"}>{c.name}</b> <span className="text-ink-4">({c.slug}) · {PRIORITY_LABEL[c.defaultPriority]}</span></span>
              <form action={categoryAction}><input type="hidden" name="toggle_id" value={c.id} /><button type="submit" className={btnLine}>{c.active ? "Switch off" : "Switch on"}</button></form>
            </li>
          ))}
        </ul>
        <form action={categoryAction} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[13px] text-ink-3">New category<input name="name" required minLength={2} maxLength={80} className={field} /></label>
          <label className="grid gap-1 text-[13px] text-ink-3">Default priority<select name="default_priority" defaultValue="medium" className={field}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
          <button type="submit" className={btnDark}>Add</button>
        </form>
      </section>

      <section className={box} aria-labelledby="tpls">
        <h2 id="tpls" className="mb-1 text-[17px] font-semibold text-ink">Reply templates</h2>
        <p className="mb-3 text-[13.5px] text-ink-3">Use <code>{"{name}"}</code> and <code>{"{order}"}</code> in the text; they are filled in when a template is picked on a ticket.</p>
        <ul className="mb-4 divide-y divide-black/[0.07] text-[14.5px]">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
              <span className="min-w-0"><b className={t.active ? "text-ink" : "text-ink-4 line-through"}>{t.title}</b><span className="block whitespace-pre-wrap break-words text-[13px] text-ink-3">{t.body.slice(0, 200)}{t.body.length > 200 ? "…" : ""}</span></span>
              <form action={templateAction}><input type="hidden" name="toggle_id" value={t.id} /><button type="submit" className={btnLine}>{t.active ? "Switch off" : "Switch on"}</button></form>
            </li>
          ))}
        </ul>
        <form action={templateAction} className="grid gap-3">
          <label className="grid gap-1 text-[13px] text-ink-3">Title<input name="title" required minLength={2} maxLength={120} className={field} /></label>
          <label className="grid gap-1 text-[13px] text-ink-3">Text<textarea name="body" required minLength={5} maxLength={8000} rows={5} className={`${field} w-full`} /></label>
          <div><button type="submit" className={btnDark}>Add template</button></div>
        </form>
      </section>

      <section className={box} aria-labelledby="bl">
        <h2 id="bl" className="mb-1 text-[17px] font-semibold text-ink">Blocked senders</h2>
        <p className="mb-3 text-[13.5px] text-ink-3">Tickets from these emails, domains or addresses are dropped without a trace. Add one with &ldquo;Spam and block this sender&rdquo; on a ticket.</p>
        {blocklist.length ? (
          <ul className="divide-y divide-black/[0.07] text-[14px]">
            {blocklist.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-all"><b>{b.kind}</b> {b.value} <span className="text-ink-4">· {b.reason} · {b.createdBy} · {when(b.createdAt)}</span></span>
                <form action={unblockAction}><input type="hidden" name="id" value={b.id} /><button type="submit" className={btnLine}>Unblock</button></form>
              </li>
            ))}
          </ul>
        ) : <p className="text-[14px] text-ink-3">Nobody is blocked.</p>}
      </section>
    </ConsolePage>
  );
}
