import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Globe2, Layers, Route, Sparkles, Target, type LucideIcon } from "lucide-react";
import { VERTICALS as ALL, type Vertical } from "./data";
import { COUNTRIES, INTERNSHIPS } from "@/components/home-options/data";
import { staticCourses } from "@/lib/market/static-catalogue";
import { EXAM_PREP } from "@/lib/pay/course-fees";
import { STAGES } from "@/lib/journey/default-template";

const ORDER = ["resume", "internships", "courses", "math", "writing", "abroad", "classes", "ebooks"];
const VERTICALS = ORDER.map((k) => ALL.find((v) => v.key === k)!);

/** Bento rows that each add up to six columns, so no tile is stretched taller than its content (that left a large empty block under Resume Studio). */
const SPAN: Record<string, string> = {
  resume: "md:col-span-3",
  internships: "md:col-span-3",
  courses: "md:col-span-2",
  abroad: "md:col-span-4",
  classes: "md:col-span-2",
  math: "md:col-span-2",
  writing: "md:col-span-2",
  ebooks: "md:col-span-6",
};

const TAG: Record<string, string> = {
  resume: "Live scoring",
  internships: "Verified employers",
  courses: "Self-paced",
  abroad: "7 destinations",
  classes: "Live with teachers",
  math: "₹699 · Level A free",
  writing: "₹499 · 2 free checks",
  ebooks: "MathStudy library",
};

const bar = "block h-1.5 rounded-full bg-white/10";

/** Static, illustrative interface previews. They show what the product looks like, not real data. */
function Visual({ v }: { v: Vertical }) {
  switch (v.key) {
    case "resume":
      return (
        <div className="mt-7 grid grid-cols-[1.1fr,1fr] gap-4" aria-hidden>
          <div className="rounded-xl bg-white p-4 shadow-2xl shadow-black/40">
            <span className="block h-2.5 w-20 rounded bg-[#0b1020]" />
            <span className="mt-1 block h-1.5 w-28 rounded bg-slate-300" />
            <div className="mt-3 space-y-1.5">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`block h-1.5 rounded ${i % 3 === 1 ? "w-4/5 bg-[var(--v)]/60" : "bg-slate-200"}`} />)}</div>
            <div className="mt-3 flex gap-1.5">{["React", "SQL", "Git"].map((s) => <span key={s} className="rounded-full bg-[var(--v)]/15 px-2 py-0.5 text-[0.6rem] font-semibold text-[#5b3fd6]">{s}</span>)}</div>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-white/50">Resume score</p>
            <p className="text-[2.4rem] font-semibold leading-none text-white">82<span className="text-[0.9rem] text-white/50">/100</span></p>
            <div className="mt-3 space-y-2">{[["Impact", "w-[88%]"], ["Keywords", "w-[74%]"], ["Format", "w-[95%]"]].map(([k, w]) => <div key={k}><div className="mb-1 flex justify-between text-[0.64rem] text-white/60"><span>{k}</span></div><span className={`${bar} overflow-hidden`}><span className={`block h-full ${w} rounded-full bg-gradient-to-r from-[var(--v)] to-[var(--v2)]`} /></span></div>)}</div>
          </div>
        </div>
      );
    case "internships":
      return (
        <div className="mt-6 space-y-2.5" aria-hidden>
          {INTERNSHIPS.slice(0, 2).map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[0.9rem] font-bold text-white" style={{ background: i.tone }}>{i.company[0]}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[0.86rem] font-semibold text-white">{i.title}</p><p className="truncate text-[0.72rem] text-white/55">{i.company} · {i.place} · {i.weeks} wks</p></div>
              <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-300">Verified</span>
            </div>
          ))}
        </div>
      );
    case "courses":
      return (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.05] p-4" aria-hidden>
          <div className="mb-2 flex justify-between text-[0.7rem] text-white/60"><span>Module 4 of 6</span><span className="font-semibold text-[var(--v)]">64%</span></div>
          <span className={`${bar} overflow-hidden`}><span className="block h-full w-[64%] rounded-full bg-gradient-to-r from-[var(--v)] to-[var(--v2)]" /></span>
          <ul className="mt-3 space-y-1.5 text-[0.76rem] text-white/75">{["Core concepts", "Guided practice", "Checkpoint quiz"].map((t, i) => <li key={t} className="flex items-center gap-2"><span className={`grid h-4 w-4 place-items-center rounded-full ${i < 2 ? "bg-[var(--v)] text-[#0b1020]" : "border border-white/30"}`}>{i < 2 ? <Check className="h-3 w-3" /> : null}</span>{t}</li>)}</ul>
        </div>
      );
    case "abroad":
      return (
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Study destinations">
          {COUNTRIES.slice(0, 8).map((c) => <li key={c.name} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5"><p className="text-[0.88rem] font-semibold text-white">{c.name}</p><p className="text-[0.68rem] text-white/55">{c.count} universities</p></li>)}
        </ul>
      );
    case "classes":
      return (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.05] p-3.5" aria-hidden>
          <p className="flex items-center gap-2 text-[0.74rem] font-semibold text-white"><span className="hx-live-dot h-2 w-2 rounded-full bg-[var(--v)]" /> Live now</p>
          <div className="mt-2.5 flex -space-x-2">{["A", "R", "M", "K"].map((c, i) => <span key={c} className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#12163a] text-[0.64rem] font-bold text-[#0b1020]" style={{ background: ["#ff9fbd", "#ffc36b", "#8ff0ff", "#b39dff"][i] }}>{c}</span>)}<span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#12163a] bg-white/15 text-[0.6rem] text-white">+12</span></div>
        </div>
      );
    case "math":
      return (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.05] p-4" aria-hidden>
          <div className="flex items-center justify-between text-[0.66rem] text-white/55"><span>Level C · Question 7 of 10</span><span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-[var(--v)]">0:12</span></div>
          <p className="mt-2 text-[1.5rem] font-semibold tracking-tight text-white">47 × 63 = <span className="rounded-md border border-[var(--v)]/60 bg-white/10 px-2">2961</span></p>
          <div className="mt-3 flex gap-1.5">{[1, 1, 1, 1, 1, 1, 0.45, 0.2, 0.2, 0.2].map((o, i) => <span key={i} className="h-1.5 flex-1 rounded-full bg-[var(--v)]" style={{ opacity: o }} />)}</div>
        </div>
      );
    case "writing":
      return (
        <div className="mt-6 grid grid-cols-[auto,1fr] items-center gap-4 rounded-xl border border-white/10 bg-white/[0.05] p-4" aria-hidden>
          <div className="text-center"><p className="text-[0.6rem] font-semibold uppercase tracking-wider text-white/50">Estimated band</p><p className="text-[2.1rem] font-semibold leading-none text-white">7.0</p></div>
          <div className="space-y-2">{[["Task response", "w-[78%]"], ["Coherence", "w-[70%]"], ["Vocabulary", "w-[85%]"]].map(([k, w]) => <div key={k}><p className="mb-0.5 text-[0.62rem] text-white/60">{k}</p><span className={`${bar} overflow-hidden`}><span className={`block h-full ${w} rounded-full bg-gradient-to-r from-[var(--v)] to-[var(--v2)]`} /></span></div>)}</div>
        </div>
      );
    default:
      return (
        <div className="hidden items-end gap-2 md:flex" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="w-11 rounded-sm bg-gradient-to-b from-[var(--v)] to-[var(--v2)] shadow-lg shadow-black/30" style={{ height: 64 + (i % 3) * 8, opacity: 1 - i * 0.14 }} />)}
        </div>
      );
  }
}

/** Counted from what the site holds, so the strip stays true as products are added. */
const STATS: Array<[LucideIcon, string, string]> = [
  [Layers, String(VERTICALS.length), "products in one workspace"],
  [BookOpen, String(staticCourses().length), "courses to learn from"],
  [Target, String(EXAM_PREP.length), "exam-prep programmes"],
  [Route, String(STAGES.filter((x) => !x.track).length), "stage overseas journey"],
  [Globe2, String(COUNTRIES.length), "study destinations"],
  [Sparkles, "Free", "to start, no card needed"],
];

export default function Pillars() {
  return (
    <section id="pillars" className="relative isolate scroll-mt-24 overflow-hidden bg-[var(--hx-navy)] px-6 py-24 text-white md:px-14 md:py-32" aria-labelledby="hx-pillars">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(120,87,255,0.28),transparent),radial-gradient(50%_45%_at_90%_30%,rgba(53,217,255,0.16),transparent),radial-gradient(40%_40%_at_50%_100%,rgba(255,95,143,0.12),transparent)]" />
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto mb-10 max-w-[800px] text-center">
          <p data-rv className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-[0.76rem] font-medium text-white/80">Learn · Build · Go global</p>
          <h2 data-rv id="hx-pillars" className="text-[clamp(2.1rem,4.6vw,3.6rem)] font-semibold leading-[1.06] tracking-tight text-white">Everything You Need to <span className="hx-grad-text">Move Forward.</span></h2>
          <p data-rv className="mt-4 text-[1.08rem] leading-relaxed text-white/70">One connected ecosystem for learning, career growth, and global opportunities.</p>
        </div>
        <dl data-rv className="mx-auto mb-12 grid max-w-[1080px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATS.map(([Icon, n, l]) => (
            <div key={l} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-white/25">
              <Icon className="mx-auto mb-2 h-[18px] w-[18px] text-[#8cf0c9]" aria-hidden />
              <dt className="sr-only">{l}</dt>
              <dd className="text-[1.65rem] font-semibold leading-none text-white">{n}<span className="mt-1.5 block text-[0.72rem] font-normal leading-tight text-white/60">{l}</span></dd>
            </div>
          ))}
        </dl>
        <ul className="grid gap-4 md:grid-cols-6">
          {VERTICALS.map((v, i) => {
            const Icon = v.icon;
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="hx-chip"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[0.68rem] font-semibold text-white/75">{TAG[v.key]}</span>
                </div>
                <h3 className="mt-5 text-[1.35rem] font-semibold text-white">{v.name}</h3>
                <p className="mt-1 text-[1.02rem] font-medium text-white/90">{v.headline}</p>
                <p className="mt-2 max-w-[36em] text-[0.92rem] leading-relaxed text-white/60">{v.blurb}</p>
                <Visual v={v} />
                <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[0.92rem] font-semibold text-[var(--v)]">{v.cta} <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--v)] text-[#0b1020] transition group-hover:translate-x-1"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span></span>
              </>
            );
            const cls = `hx-tile hx-tile-dark group flex h-full flex-col p-7 hx-v-${v.key} ${v.key === "ebooks" ? "md:flex-row md:items-end md:justify-between md:gap-10" : ""}`;
            return (
              <li key={v.key} data-rv style={{ ["--d" as string]: `${i * 0.05}s` }} className={SPAN[v.key]}>
                {v.external
                  ? <a href={v.href} target="_blank" rel="noopener noreferrer" className={cls}><div className="flex h-full flex-col">{body}</div></a>
                  : <Link href={v.href} className={cls}><div className="flex h-full flex-col">{body}</div></Link>}
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-center text-[0.72rem] text-white/40">Illustrative previews. Open any product to see the real thing.</p>
      </div>
    </section>
  );
}
