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

/** Cover colours per stage, in the same family as the course covers (gradient, soft rings, a large glyph on a frosted tile). */
const TONE: Record<number, [string, string]> = {
  1: ["#ff7a45", "#ffb347"], 2: ["#7c5cff", "#b39dff"], 3: ["#1fa2ff", "#6dd5fa"], 4: ["#00b894", "#55efc4"], 5: ["#e84393", "#fd79a8"], 6: ["#2d6cdf", "#74a9ff"],
  7: ["#6c5ce7", "#a29bfe"], 8: ["#f39c12", "#f9ca24"], 9: ["#16a085", "#48dbb4"], 10: ["#c0392b", "#ff7675"], 11: ["#0984e3", "#74b9ff"], 12: ["#e17055", "#fab1a0"], 13: ["#636e72", "#b2bec3"], 14: ["#d6a100", "#ffe27a"],
};

function Cover({ no, Icon, state }: { no: number; Icon: LucideIcon; state: "done" | "current" | "todo" }) {
  const [a, b] = TONE[no] ?? TONE[1];
  const id = `rc-${no}`;
  return (
    <span className={`relative block overflow-hidden rounded-xl aspect-[16/9] ${state === "todo" ? "opacity-70 saturate-[.7]" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" focusable="false" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id={id} gradientTransform={`rotate(${(no * 37) % 90 + 20} .5 .5)`}><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
          <radialGradient id={`${id}g`} cx="0.75" cy="0.4" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#${id})`} />
        <g fill="none" stroke="#fff">{[0, 1, 2].map((i) => <circle key={i} cx={no % 2 ? 300 : 20} cy="160" r={46 + i * 34} strokeOpacity={0.22 - i * 0.05} strokeWidth="2" />)}</g>
        <rect width="320" height="180" fill={`url(#${id}g)`} />
      </svg>
      <span className="absolute left-3 top-3 text-[11px] font-bold tracking-wide text-white/90 bg-black/20 rounded-full px-2 py-0.5">{no > 12 ? "TRACK" : `STAGE ${no}`}</span>
      <span className="absolute right-3 bottom-3 grid place-items-center w-14 h-14 rounded-2xl bg-white/20 border border-white/40 backdrop-blur-sm text-white"><Icon className="w-8 h-8" strokeWidth={1.6} /></span>
      {state === "done" ? <span className="absolute right-3 top-3 grid place-items-center w-7 h-7 rounded-full bg-white text-emerald-600 shadow"><Check className="w-4 h-4" strokeWidth={3} /></span> : null}
    </span>
  );
}

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
      <ol className={`mt-4 grid grid-cols-2 gap-3 sm:gap-4 ${compact ? "md:grid-cols-4 xl:grid-cols-6" : "md:grid-cols-3 xl:grid-cols-4"}`}>
        {nodes.map((s) => {
          const p = by.get(s.no) as StageProgress;
          const st = state(s.no);
          const Icon = ICON[s.no] ?? UserRound;
          return (
            <li key={s.no} aria-current={st === "current" ? "step" : undefined}>
              <Link href={`${href}#stage-${s.no}`} className={`group block rounded-2xl border p-2 transition hover:-translate-y-0.5 hover:shadow-card ${st === "current" ? "border-orange ring-2 ring-orange/30 bg-orange-light/40" : "border-black/[0.08] bg-white"}`}>
                <Cover no={s.no} Icon={Icon} state={st} />
                <span className="block px-1.5 pt-2 pb-1">
                  <span className="flex items-start justify-between gap-2"><span className="text-[14px] font-semibold text-ink leading-snug">{SHORT[s.no] ?? s.name}</span>
                    {st === "current" ? <span className="shrink-0 rounded-full bg-orange px-2 py-0.5 text-[11px] font-bold text-white">You are here</span> : null}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">{st === "done" ? "Complete" : `${p.done} of ${p.total} steps`}<span className="sr-only"> ({st === "done" ? "done" : st === "current" ? "current stage" : "not started yet"})</span></span>
                  {compact ? null : <span className="mt-1.5 block h-1.5 rounded-full bg-cream-3 overflow-hidden"><span className={`block h-full rounded-full ${st === "done" ? "bg-emerald-600" : "bg-orange"}`} style={{ width: `${p.pct}%` }} /></span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
