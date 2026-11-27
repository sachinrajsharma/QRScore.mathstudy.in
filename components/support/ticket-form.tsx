"use client";

import { useEffect, useState } from "react";
import { HumanCheck, type CaptchaInfo } from "@/components/portal/auth-controls";
import { btnPrimary, inputCls } from "@/components/support/ui";

/**
 * The ticket form, for guests and signed-in members. Quick answers for the chosen category show before the person sends anything.
 * Anti-spam: a hidden "website" field people never see, and a timestamp set when the page loaded (a bot that posts straight back has none).
 */
export interface FormCategory { slug: string; name: string }
export interface FormKb { cats: string[]; q: string; a: string }

export function TicketForm({ action, captcha, categories, kb, member, accept, limits }: {
  action: (fd: FormData) => void | Promise<void>; captcha: CaptchaInfo; categories: FormCategory[]; kb: FormKb[];
  member: { email: string } | null; accept: string; limits: { perHour: number; openAtOnce: number };
}) {
  const [cat, setCat] = useState("");
  const [ts, setTs] = useState("");
  const [ready, setReady] = useState(captcha.mode === "off");
  useEffect(() => { setTs(String(Date.now())); }, []);
  const shown = kb.filter((e) => !cat || e.cats.includes(cat));
  return (
    <form action={action} encType="multipart/form-data" className="grid gap-5">
      {shown.length ? (
        <section aria-label="Quick answers" className="rounded-2xl border border-black/[0.08] bg-cream-2/50 p-4">
          <h2 className="text-[16px] font-semibold text-ink">Maybe this answers it</h2>
          <div className="mt-2 divide-y divide-black/[0.08]">
            {shown.map((e) => <details key={e.q} className="py-2"><summary className="cursor-pointer text-[15px] font-medium text-ink">{e.q}</summary><p className="mt-1.5 text-[14.5px] text-ink-2">{e.a}</p></details>)}
          </div>
        </section>
      ) : null}

      {!member ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="name" className="text-[15px] font-semibold text-ink">Your name <span className="text-red-700" aria-hidden>*</span></label><input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" className={`${inputCls} mt-1.5`} /></div>
          <div><label htmlFor="email" className="text-[15px] font-semibold text-ink">Email <span className="text-red-700" aria-hidden>*</span></label><input id="email" name="email" type="email" required maxLength={190} autoComplete="email" className={`${inputCls} mt-1.5`} /></div>
          <div><label htmlFor="phone" className="text-[15px] font-semibold text-ink">Mobile number (optional)</label><input id="phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className={`${inputCls} mt-1.5`} /></div>
        </div>
      ) : null}

      <div>
        <label htmlFor="category" className="text-[15px] font-semibold text-ink">What is it about? <span className="text-red-700" aria-hidden>*</span></label>
        <select id="category" name="category" required value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} mt-1.5`}>
          <option value="" disabled>Choose one</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="subject" className="text-[15px] font-semibold text-ink">Subject <span className="text-red-700" aria-hidden>*</span></label>
        <input id="subject" name="subject" required minLength={5} maxLength={160} placeholder="One line that sums it up" className={`${inputCls} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="related_ref" className="text-[15px] font-semibold text-ink">Order, payment or reference number (optional)</label>
        <input id="related_ref" name="related_ref" maxLength={80} placeholder="For example, from your receipt email" className={`${inputCls} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="body" className="text-[15px] font-semibold text-ink">Describe the problem <span className="text-red-700" aria-hidden>*</span></label>
        <textarea id="body" name="body" required minLength={15} maxLength={8000} rows={8} placeholder="What happened, what you expected, and any error message you saw." className={`${inputCls} mt-1.5 min-h-[180px]`} />
        <p className="mt-1.5 text-[13px] text-ink-4">{member ? `The ticket is linked to your account (${member.email}). ` : "We reply by email and on your private ticket page. "}Please do not include passwords or full card numbers.</p>
      </div>
      <div>
        <label htmlFor="attachments" className="text-[15px] font-semibold text-ink">Screenshots or documents (optional)</label>
        <input id="attachments" name="attachments" type="file" multiple accept={accept} className={`${inputCls} mt-1.5 py-2`} />
        <p className="mt-1.5 text-[13px] text-ink-4">Up to 3 files: JPG, PNG or PDF, 10 MB each.</p>
      </div>

      {/* Honeypot: invisible to people and to screen readers; a bot that fills it is dropped. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Leave this empty<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <input type="hidden" name="form_ts" value={ts} />

      <HumanCheck captcha={captcha} onReady={setReady} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!ready} className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}>Send ticket</button>
      </div>
      <p className="text-[13px] text-ink-4">You can open up to {limits.perHour} tickets an hour{member ? ` and keep ${limits.openAtOnce} open at a time` : ""}.</p>
    </form>
  );
}
