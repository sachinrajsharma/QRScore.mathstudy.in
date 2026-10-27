import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskView } from "@/lib/journey/service";
import { STATUS_LABEL, type Priority, type Status } from "@/lib/journey/types";

/** Small presentational pieces shared by the student journey and the staff workspace. Server components, no client JS. */

export const day = (s: string | null | undefined): string => (s ? new Date(s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
export const when = (s: string | null | undefined): string => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }) : "—");

const STATUS_STYLE: Record<Status, string> = {
  not_started: "bg-cream-3 text-ink-2", ready_to_start: "bg-blue-50 text-blue-800 border-blue-200", in_progress: "bg-orange-light text-ink border-orange/40", submitted_for_review: "bg-violet-50 text-violet-800 border-violet-200",
  changes_requested: "bg-amber-50 text-amber-900 border-amber-300", waiting_on_student: "bg-amber-50 text-amber-900 border-amber-300", waiting_on_university: "bg-sky-50 text-sky-900 border-sky-200", blocked: "bg-red-50 text-red-800 border-red-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200", not_applicable: "bg-cream-3 text-ink-4",
};

/** Status is always written out as words (never colour alone). */
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityTag({ p }: { p: Priority }) {
  if (p === "normal" || p === "low") return null;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${p === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{p === "critical" ? "Critical" : "High"}</span>;
}

export function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2.5 w-full rounded-full bg-cream-3 overflow-hidden">
      <div className="h-full rounded-full bg-orange" style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

export function DueText({ v }: { v: TaskView }) {
  const t = v.task;
  if (["completed", "not_applicable"].includes(t.status)) return <span className="text-ink-4">{t.status === "completed" ? `Done ${day(t.completedAt)}` : "Not applicable"}</span>;
  if (v.overdue) {
    const who = v.party === "university" ? " (waiting on the university)" : v.party === "consultant" ? " (with your consultant)" : "";
    return <span className="font-semibold text-red-700">Overdue by {v.overdueDays} day{v.overdueDays === 1 ? "" : "s"}{who}</span>;
  }
  return <span className="text-ink-3">Due {day(t.dueAt)}</span>;
}

const ownerLabel = (v: TaskView, forStudent: boolean): string => (v.task.owner === "student" ? (forStudent ? "You" : "Student") : v.task.owner === "consultant" ? (forStudent ? "Your consultant" : "Consultant") : "University");

/** One task row: title, status, who, when, why it is blocked, and the button. */
export function TaskRow({ v, href, forStudent = true, appLabel, id }: { v: TaskView; href: string; forStudent?: boolean; appLabel?: string; id?: string }) {
  const t = v.task;
  const actionable = !v.ent.locked && !["completed", "not_applicable"].includes(t.status);
  const mine = forStudent ? t.owner === "student" : true;
  const label = v.ent.locked ? "See what's included" : !actionable ? "View" : v.effective === "blocked" ? "See what's blocking" : !mine ? "View" : t.status === "changes_requested" ? "Fix and resubmit" : t.status === "submitted_for_review" ? "View" : t.action || (t.status === "in_progress" ? "Continue" : "Start");
  return (
    <li id={id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 border-t border-black/[0.07] first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
          <span>{t.title}</span><PriorityTag p={t.priority} />
          {appLabel ? <span className="rounded bg-cream-3 px-1.5 py-0.5 text-[12px] font-normal text-ink-3">{appLabel}</span> : null}
          {t.attempt > 1 ? <span className="rounded bg-cream-3 px-1.5 py-0.5 text-[12px] font-normal text-ink-3">Attempt {t.attempt}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {v.ent.locked ? <span className="rounded-full bg-cream-3 px-2 py-0.5 text-ink-2"><span aria-hidden="true">🔒 </span>Included in {v.ent.needs}</span> : <StatusBadge status={v.effective} />}
          <span className="text-ink-3">{ownerLabel(v, forStudent)}</span><DueText v={v} />
          {v.naPending ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px] text-amber-900">Not-applicable request waiting</span> : null}
        </p>
        {v.effective === "blocked" && v.block.reason ? <p className="mt-1 text-[13px] text-red-800">{v.block.reason}{v.block.blockers[0] ? ` ${v.block.blockers[0].howToUnblock}` : ""}</p> : null}
        {t.status === "changes_requested" ? <p className="mt-1 text-[13px] text-amber-900">Your consultant asked for changes. Open this task to read what to fix.</p> : null}
      </div>
      <Link href={href} className={`shrink-0 min-h-[44px] inline-flex items-center justify-center rounded-lg px-4 text-[14px] font-semibold ${actionable && mine && v.effective !== "blocked" ? "bg-orange hover:bg-orange-dark text-white" : "border border-black/[0.15] hover:bg-cream-2 text-ink"}`}>
        {label}<span className="sr-only">: {t.title}</span>
      </Link>
    </li>
  );
}

export function Tile({ label, value, tone = "plain", note }: { label: string; value: ReactNode; tone?: "plain" | "warn" | "bad"; note?: string }) {
  const c = tone === "bad" ? "border-red-200 bg-red-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-black/[0.08] bg-white";
  return <div className={`rounded-2xl border p-4 ${c}`}><dt className="text-[13px] text-ink-3">{label}</dt><dd className="text-[26px] font-bold text-ink leading-tight">{value}</dd>{note ? <dd className="text-[12px] text-ink-4">{note}</dd> : null}</div>;
}

export const input = "w-full px-3 py-2.5 rounded-lg border border-black/[0.15] bg-white text-[15px] min-h-[44px]";
export const label = "block text-[13px] font-medium text-ink-2 mb-1";
export const btnPrimary = "min-h-[44px] px-5 rounded-lg bg-orange hover:bg-orange-dark text-white text-[14px] font-semibold";
export const btnGhost = "min-h-[44px] px-4 rounded-lg border border-black/[0.15] text-[14px] font-medium hover:bg-cream-2";

export const HONESTY = "GrowQR's counsellors help you prepare and track every step. Admission, scholarship and visa decisions are made by universities and governments, so no step or package can guarantee an outcome.";
