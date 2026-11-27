import type { ReactNode } from "react";
import { PRIORITY_LABEL, STAFF_STATUS_LABEL, STATUS_LABEL, type Priority, type Status } from "@/lib/support/model";
import type { Attachment, Message } from "@/lib/support/store";

export const btnPrimary = "inline-flex min-h-[48px] items-center justify-center rounded-lg bg-orange px-5 text-[15px] font-semibold text-white hover:bg-orange-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-deep";
export const btnLight = "inline-flex min-h-[48px] items-center justify-center rounded-lg border border-black/[0.15] bg-white px-5 text-[15px] font-semibold text-ink hover:bg-cream-2";
export const inputCls = "w-full rounded-lg border border-black/[0.18] bg-white px-3.5 py-2.5 text-[15px] text-ink min-h-[48px] focus:border-orange focus:outline-none";

const STATUS_TONE: Record<Status, string> = { open: "bg-blue-100 text-blue-800", pending: "bg-amber-100 text-amber-900", waiting_user: "bg-orange-light text-orange-deep", resolved: "bg-emerald-100 text-emerald-800", closed: "bg-black/[0.07] text-ink-3" };
const PRIORITY_TONE: Record<Priority, string> = { critical: "bg-red-100 text-red-800", high: "bg-orange-light text-orange-deep", medium: "bg-yellow-100 text-yellow-900", low: "bg-sky-100 text-sky-800" };

export function StatusBadge({ status, staff = false }: { status: Status; staff?: boolean }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}>{(staff ? STAFF_STATUS_LABEL : STATUS_LABEL)[status]}</span>;
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${PRIORITY_TONE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

/** A database timestamp (UTC) in India time, which is where most people using the portal are. */
export function when(db: string): string {
  const d = new Date(db.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? db : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export const size = (n: number): string => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The conversation. Staff internal notes (only ever passed to the admin pages) are shown on a dashed yellow card. */
export function Thread({ messages, you, attachmentHref = (a) => `/support/attachment/${a.id}` }: { messages: Message[]; you: "person" | "staff"; attachmentHref?: (a: Attachment) => string }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = you === "person" ? !m.isStaff : m.isStaff && !m.isInternal;
        const tone = m.isInternal ? "border-dashed border-amber-400 bg-amber-50" : m.isStaff ? "border-orange/30 bg-orange-lighter" : "border-black/[0.08] bg-white";
        return (
          <li key={m.id} className={`rounded-2xl border p-4 ${tone} ${mine ? "sm:ml-10" : "sm:mr-10"}`}>
            <p className="mb-1 text-[12.5px] text-ink-3"><b className="text-ink">{m.isInternal ? "Internal note" : m.isStaff ? `${m.authorName} (GrowQR support)` : m.authorName}</b> · {when(m.createdAt)}</p>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">{m.body}</p>
            {m.attachments.length ? <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attachments">{m.attachments.map((a) => <li key={a.id}><a href={attachmentHref(a)} className="inline-flex min-h-[36px] items-center rounded-lg border border-black/[0.15] bg-white px-3 text-[13px] underline" target="_blank" rel="noopener noreferrer">{a.name} <span className="ml-1.5 text-ink-4">({size(a.size)})</span></a></li>)}</ul> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }): ReactNode {
  if (err) return <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[14px] text-red-800">{err}</p>;
  if (ok) return <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[14px] text-emerald-900">{ok}</p>;
  return null;
}
