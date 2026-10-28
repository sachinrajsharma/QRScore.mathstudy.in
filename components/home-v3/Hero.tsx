import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { VERTICALS, portal, type VerticalKey } from "./data";
import { COUNTRIES, INTERNSHIPS } from "@/components/home-options/data";
import ResumeDrop from "./ResumeDrop";

const intern = INTERNSHIPS[2];

/** Mini interface previews. All values are illustrative and the hero says so. */
function Preview({ k }: { k: VerticalKey }) {
  switch (k) {
    case "resume":
      return (
        <div className="mt-3 flex items-center gap-3">
          <div className="w-14 space-y-1.5 rounded-md bg-white/90 p-2" aria-hidden>
            <span className="block h-1.5 w-8 rounded bg-[#0b1020]" />
            <span className="block h-1 rounded bg-slate-300" />
            <span className="block h-1 w-10 rounded bg-slate-300" />
            <span className="block h-1 rounded bg-slate-300" />
          </div>
          <div><p className="text-[1.5rem] font-semibold leading-none text-white">82<span className="text-[0.7rem] text-white/50">/100</span></p><p className="text-[0.68rem] text-white/60">Resume score</p></div>
        </div>
      );
    case "internships":
      return (
        <div className="mt-3 text-[0.74rem] text-white/70">
          <p className="font-semibold text-white">{intern.title}</p>
          <p>{intern.company} · {intern.remote ? "Remote" : intern.place} · {intern.weeks} wks</p>
        </div>
      );
    case "courses":
      return (
        <div className="mt-3" aria-hidden>
          <div className="mb-1 flex justify-between text-[0.68rem] text-white/60"><span>Module 4 of 6</span><span>64%</span></div>
          <div className="h-1.5 rounded-full bg-white/15"><span className="block h-full w-[64%] rounded-full bg-[var(--v)]" /></div>
        </div>
      );
    case "abroad":
      return (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
          {COUNTRIES.slice(0, 4).map((c) => <span key={c.name} className="rounded-full bg-white/12 px-2 py-0.5 text-[0.68rem] text-white/80">{c.name}</span>)}
        </div>
      );
    case "classes":
      return (
        <div className="mt-3 flex items-center gap-2 text-[0.74rem] text-white/80">
          <span className="hx-live-dot h-2 w-2 rounded-full bg-[var(--v)]" aria-hidden /> Live session
        </div>
      );
    case "math":
      return (
        <div className="mt-3" aria-hidden>
          <p className="text-[0.95rem] font-semibold text-white">47 × 63 = ?</p>
          <p className="text-[0.68rem] text-white/60">15 levels · Level A free</p>
        </div>
      );
    case "writing":
      return (
        <div className="mt-3 text-[0.72rem] text-white/70" aria-hidden>
          <div className="mb-1.5 flex gap-1.5">{["IELTS", "SAT", "GRE", "GMAT"].map((x) => <span key={x} className="rounded-full bg-white/12 px-2 py-0.5 text-[0.62rem] text-white/80">{x}</span>)}</div>
          Instant essay score
        </div>
      );
    case "ebooks":
      return (
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className="h-12 w-8 rounded-sm bg-gradient-to-b from-[var(--v)] to-[var(--v2)]" style={{ opacity: 1 - i * 0.22, transform: `translateY(${i * 2}px)` }} />)}
        </div>
      );
  }
}

function Module({ k, className = "" }: { k: VerticalKey; className?: string }) {
  const v = VERTICALS.find((x) => x.key === k)!;
  const Icon = v.icon;
  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="hx-chip !h-9 !w-9 !rounded-xl"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
        <span className="text-[0.92rem] font-semibold text-white">{v.name}</span>
      </div>
      <Preview k={k} />
    </>
  );
  const cls = `hx-glass hx-v-${k} block rounded-2xl p-4 text-left transition hover:-translate-y-1 hover:border-white/30 ${className}`;
  return v.external
    ? <a href={v.href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${v.name}: ${v.cta}`}>{inner}</a>
    : <Link href={v.href} className={cls} aria-label={`${v.name}: ${v.cta}`}>{inner}</Link>;
}

/**
 * The ecosystem map is a fixed 3-column grid (module | workspace | module) with four equal rows, so every module sits the same distance
 * from the centre as its mirror image on the other side, and the gaps between modules and the workspace are all equal.
 * `nudge` can pull the two outer rows in a little for an oval look; it is 0 so every gap to the workspace is identical.
 * Line ends below are the module centres in this box; keep them in step with these numbers.
 */
const MAP = { w: 622, h: 616, tile: 180, ws: 190, gap: 36, row: 154, nudge: 0 } as const;
const COL_X = { left: MAP.tile / 2, right: MAP.w - MAP.tile / 2 }; // module centres across the box
const ROW_Y = [0, 1, 2, 3].map((r) => MAP.row * r + MAP.row / 2);
/** Module -> [side, row] */
const CELL: Record<VerticalKey, ["left" | "right", number]> = {
  resume: ["left", 0], internships: ["right", 0], courses: ["left", 1], abroad: ["right", 1],
  math: ["left", 2], writing: ["right", 2], classes: ["left", 3], ebooks: ["right", 3],
};
const inset = (row: number): number => (row === 0 || row === 3 ? MAP.nudge : 0);
const lineEnd = (k: VerticalKey): [number, number] => {
  const [side, row] = CELL[k];
  return [COL_X[side] + (side === "left" ? inset(row) : -inset(row)), ROW_Y[row]];
};

function Workspace() {
  return (
    <div className="hx-glass rounded-3xl p-5 text-center">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[var(--hx-cyan)]">Your GrowQR workspace</p>
      <div className="relative mx-auto my-4 grid h-28 w-28 place-items-center" aria-hidden>
        <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#hxg)" strokeWidth="8" strokeLinecap="round" strokeDasharray="327" strokeDashoffset="82" />
          <defs><linearGradient id="hxg" x1="0" x2="1"><stop stopColor="#7857ff" /><stop offset="1" stopColor="#35d9ff" /></linearGradient></defs>
        </svg>
        <span className="text-[1.9rem] font-semibold text-white">75</span>
      </div>
      <p className="text-[0.82rem] text-white/70">Learn, build and apply from one place</p>
    </div>
  );
}

export default function Hero() {
  return (
    <header className="hx-hero relative isolate overflow-hidden text-white">
      <div className="relative z-10 mx-auto grid max-w-[1320px] items-center gap-14 px-6 pb-24 pt-36 md:px-14 md:pt-44 xl:grid-cols-[1fr,622px]">
        <div>
          <p data-rv className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-[0.78rem] font-medium text-white/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[var(--hx-cyan)]" aria-hidden /> Learn, Build, and Go Global
          </p>
          <h1 data-rv style={{ ["--d" as string]: ".06s" }} className="text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-[1.02] text-white">
            Your Future <span className="hx-grad-text">Doesn&rsquo;t Have to Wait.</span>
          </h1>
          <p data-rv style={{ ["--d" as string]: ".12s" }} className="mt-6 max-w-[34em] text-[1.12rem] leading-relaxed text-white/75">
            Learn new skills, build your career, discover global education opportunities, and unlock your next big move, all in one place.
          </p>
          <div data-rv style={{ ["--d" as string]: ".16s" }}><ResumeDrop /></div>
          <div data-rv style={{ ["--d" as string]: ".18s" }} className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#pillars" className="hx-btn hx-btn-ghost">Explore Your Future <ArrowRight className="h-4 w-4" aria-hidden /></a>
            <a href="#pillars" className="hx-btn px-3 text-white/80 underline-offset-4 hover:text-white hover:underline">Discover All Services</a>
            <Link href={portal("/studio")} className="hx-btn px-3 text-white/80 underline-offset-4 hover:text-white hover:underline">Build My Resume</Link>
          </div>
          <a href="#pillars" className="mt-10 hidden items-center gap-2 text-[0.8rem] text-white/50 transition hover:text-white md:inline-flex" aria-label="Scroll to services">
            <ChevronDown className="h-4 w-4 animate-bounce motion-reduce:animate-none" aria-hidden /> Scroll to explore
          </a>
        </div>

        {/* Ecosystem. Stacked grid below xl, connected map from xl up. */}
        <div data-rv style={{ ["--d" as string]: ".14s" }}>
          <div className="grid grid-cols-2 gap-3 xl:hidden">
            <div className="col-span-2"><Workspace /></div>
            {VERTICALS.map((v) => <Module key={v.key} k={v.key} />)}
          </div>
          <div className="relative hidden xl:block" style={{ width: MAP.w, height: MAP.h }}>
            <svg viewBox={`0 0 ${MAP.w} ${MAP.h}`} className="absolute inset-0" aria-hidden>
              {VERTICALS.map((v) => { const [x, y] = lineEnd(v.key); return <line key={v.key} x1={MAP.w / 2} y1={MAP.h / 2} x2={x} y2={y} stroke="url(#hxl)" strokeWidth="1.5" className="hx-flow" />; })}
              <defs><linearGradient id="hxl" x1="0" x2="1"><stop stopColor="#7857ff" stopOpacity=".9" /><stop offset="1" stopColor="#35d9ff" stopOpacity=".9" /></linearGradient></defs>
            </svg>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: MAP.ws }}><Workspace /></div>
            {VERTICALS.map((v, i) => {
              const [side, row] = CELL[v.key];
              const [cx, cy] = lineEnd(v.key);
              return (
                <div key={v.key} className="absolute flex items-center justify-center" style={{ width: MAP.tile, height: MAP.row - 14, left: cx - MAP.tile / 2, top: cy - (MAP.row - 14) / 2 }}>
                  <div className="hx-float w-full" style={{ animationDelay: `${(side === "left" ? row : row + 4) * -0.9}s` }}><Module k={v.key} /></div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[0.72rem] text-white/45">Illustrative previews. Open any module to see the real thing.</p>
        </div>
      </div>
    </header>
  );
}
