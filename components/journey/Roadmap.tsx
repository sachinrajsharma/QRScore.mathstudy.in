import Link from "next/link";
import { Award, Briefcase, Check, ClipboardCheck, Coins, FolderOpen, GraduationCap, House, MessagesSquare, PenLine, Plane, Send, ShieldCheck, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { STAGES } from "@/lib/journey/default-template";

/**
 * The visual roadmap: every stage of the journey as a connected path with an icon, so a student (or an investor) sees the whole road at once, which
 * stages are done, and where the student is right now. State comes from real task progress: a stage is "done" only when all of its steps are.
 */
const ICON: Record<number, LucideIcon> = { 1: UserRound, 2: ClipboardCheck, 3: GraduationCap, 4: FolderOpen, 5: PenLine, 6: Send, 7: MessagesSquare, 8: Award, 9: Wallet, 10: ShieldCheck, 11: Plane, 12: House, 13: Briefcase, 14: Coins };
const SHORT: Record<number, string> = { 1: "Profile & counselling", 2: "Eligibility", 3: "Shortlisting", 4: "Documents", 5: "Exams & prep", 6: "Applications", 7: "Follow-up & interviews", 8: "Offers & decision", 9: "Finance & housing", 10: "Visa", 11: "Pre-departure", 12: "Arrival & enrolment", 13: "Internships", 14: "Part-time work" };

export interface StageProgress { stage: number; total: number; done: number; pct: number }

export function Roadmap({ stages, href = "/abroad/journey", compact = false }: { stages: StageProgress[]; href?: string; compact?: boolean }) {
  const by = new Map(stages.map((s) => [s.stage, s]));
  const nodes = STAGES.filter((s) => by.has(s.no));
  const firstOpen = nodes.find((s) => !s.track && (by.get(s.no)?.done ?? 0) < (by.get(s.no)?.total ?? 0))?.no;
  const state = (no: number): "done" | "current" | "todo" => {
    const p = by.get(no) as StageProgress;
    return p.total > 0 && p.done === p.total ? "done" : no === firstOpen ? "current" : "todo";
  };
  const core = nodes.filter((s) => !s.track);
  const doneCount = core.filter((s) => state(s.no) === "done").length;
  return (
    <section aria-labelledby="road-h" className="mb-6 rounded-2xl border border-black/[0.08] bg-white shadow-card p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="road-h" className="text-[18px] font-semibold text-ink">Your road to studying abroad</h2>
        <p className="text-[13px] text-ink-3">{doneCount} of {core.length} stages complete{firstOpen ? <> · you are on <b className="text-ink">stage {firstOpen}: {SHORT[firstOpen]}</b></> : null}</p>
      </div>
      <ol className={`mt-4 ${compact ? "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-5"}`}>
        {nodes.map((s) => {
          const p = by.get(s.no) as StageProgress;
          const st = state(s.no);
          const Icon = ICON[s.no] ?? UserRound;
          const ring = st === "done" ? "bg-emerald-600 text-white" : st === "current" ? "bg-orange text-white ring-4 ring-orange/25" : "bg-cream-3 text-ink-3";
          return (
            <li key={s.no} aria-current={st === "current" ? "step" : undefined}>
              <Link href={`${href}#stage-${s.no}`} className={`group flex items-start gap-3 rounded-xl p-2 -m-2 hover:bg-cream-2 ${st === "current" ? "bg-orange-light/50" : ""}`}>
                <span className={`relative shrink-0 grid place-items-center w-11 h-11 rounded-full ${ring}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {st === "done" ? <span className="absolute -right-1 -bottom-1 grid place-items-center w-5 h-5 rounded-full bg-white text-emerald-600 border border-emerald-600"><Check className="w-3 h-3" aria-hidden="true" /></span> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] text-ink-4">{s.track ? "Optional track" : `Stage ${s.no}`}</span>
                  <span className="block text-[14px] font-semibold text-ink leading-snug">{SHORT[s.no] ?? s.name}</span>
                  {st === "current" ? <span className="mt-0.5 inline-block rounded-full bg-orange px-2 py-0.5 text-[11px] font-bold text-white">You are here</span> : null}
                  <span className="block text-[12px] text-ink-3">{st === "done" ? "Complete" : `${p.done} of ${p.total} steps`}<span className="sr-only"> ({st === "done" ? "done" : st === "current" ? "current stage" : "not started yet"})</span></span>
                  {compact ? null : <span className="mt-1 block h-1.5 w-24 rounded-full bg-cream-3 overflow-hidden"><span className={`block h-full ${st === "done" ? "bg-emerald-600" : "bg-orange"}`} style={{ width: `${p.pct}%` }} /></span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
