import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, BookOpen, FileText, Globe2, GraduationCap, Landmark, Lock, QrCode, Route, Sparkles, Target } from "lucide-react";
import { PROVIDERS, providerEnabled, providerLabel, type Provider } from "@/lib/portal/oauth";
import { authFacts, type AuthFacts } from "@/lib/portal/auth-facts";
import "./auth.css";

/** Split-screen frame for login, sign-up and the other account pages: an animated brand panel beside the form. */
type Point = [typeof Lock, string, string];
export type PanelKey = "login" | "signup" | "account";
/** What the brand panel says. It leads with what the student gets, then ends with a one-line promise about safety. */
const PANELS = (f: AuthFacts): Record<PanelKey, { headline: string; points: Point[] }> => ({
  login: {
    headline: "Pick up right where you left off.",
    points: [
      [FileText, "Your resume, saved", "Open Resume Studio and carry on editing, on any device."],
      [BookOpen, "Your learning, tracked", `${f.courses} courses, exam prep and practice studios, with your progress remembered.`],
      [Route, "Your journey, stage by stage", "Your overseas roadmap, applications and consultant in one place."],
    ],
  },
  signup: {
    headline: "Free to start. Yours to keep.",
    points: [
      [GraduationCap, "Learn with structure", "Courses, mock tests and exam prep for school, college and careers."],
      [FileText, "Build a resume that works", "Templates, live scoring and ATS checks in Resume Studio."],
      [Globe2, "Go further", `A ${f.stages}-stage study abroad journey, a verified Skill Passport and internships.`],
    ],
  },
  account: {
    headline: "Your future doesn’t have to wait.",
    points: [
      [GraduationCap, "Courses and exam prep", "Learn at your own pace, with progress saved."],
      [FileText, "Resume Studio", "Build and improve your resume with live scoring."],
      [Globe2, "Internships and study abroad", "Opportunities and plans, all in one account."],
    ],
  },
});

/** The studios, shown as chips so a visitor sees how much is inside one account. */
const STUDIOS = ["Resume Studio", "Maths Speed Studio", "Mathematics Studio", "English Reading Studio", "English Writing Studio", "Skill Passport"];

function stats(f: AuthFacts): Array<[typeof Lock, string, string]> {
  const list: Array<[typeof Lock, string, string]> = [
    [BookOpen, String(f.courses), "courses"],
    [FileText, String(f.templates), "resume templates"],
    [Target, String(f.exams), "exam-prep courses"],
    [Route, String(f.stages), "stage overseas journey"],
  ];
  if (f.universities) list.push([Landmark, String(f.universities), "universities"]);
  list.push([Globe2, String(f.countries), "study destinations"]);
  return list;
}

export async function AuthSplit({ title, subtitle, children, eyebrow = "Welcome", panel = "account" }: { title: string; subtitle?: ReactNode; children: ReactNode; eyebrow?: string; panel?: PanelKey }) {
  const facts = await authFacts();
  const P = PANELS(facts)[panel];
  const S = stats(facts);
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.02fr_1fr]">
      <aside className="auth-panel relative hidden flex-col justify-between gap-8 overflow-hidden p-12 text-white lg:flex" aria-label="About GrowQR">
        <span className="auth-orb -left-16 top-24 h-72 w-72 bg-[#7857ff]" aria-hidden />
        <span className="auth-orb bottom-10 right-0 h-64 w-64 bg-[#ff6a2f]" style={{ animationDelay: "-6s" }} aria-hidden />
        <span className="auth-orb left-1/3 top-1/2 h-48 w-48 bg-[#ec4899]" style={{ animationDelay: "-11s" }} aria-hidden />
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5 text-[22px] font-bold tracking-tight" aria-label="GrowQR home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ff6a2f] to-[#ec4899] text-white shadow-lg"><QrCode className="h-5 w-5" aria-hidden /></span>
            GrowQR
          </Link>
        </div>
        <div className="relative z-10 max-w-[30rem]">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#ffd7bd]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Learn. Build. Go global.</p>
          <p className="auth-headline mt-4 [font-size:clamp(2.1rem,3.4vw,3.2rem)] font-bold leading-[1.05] tracking-tight">{P.headline}</p>
          <ul className="mt-7 space-y-3">
            {P.points.map(([Icon, t, d]) => (
              <li key={t} className="auth-card flex gap-3.5 rounded-2xl p-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10"><Icon className="h-5 w-5 text-[#ffb98f]" aria-hidden /></span>
                <span><b className="block text-[15px]">{t}</b><span className="text-[13.5px] leading-snug text-white/70">{d}</span></span>
              </li>
            ))}
          </ul>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Inside your account">
            {STUDIOS.map((n) => <li key={n} className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-white/85 ring-1 ring-white/15">{n}</li>)}
          </ul>
          <div className={`mt-5 grid gap-3 text-center ${S.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {S.map(([Icon, n, l], i) => (
              <div key={l} className="auth-float rounded-2xl bg-white/10 px-2 py-3 ring-1 ring-white/15" style={{ animationDelay: `-${i * 1.1}s` }}>
                <Icon className="mx-auto mb-1 h-4 w-4 text-[#ffb98f]" aria-hidden />
                <b className="block text-[1.5rem] font-bold leading-none text-white">{n}</b>
                <span className="mt-1 block text-[11.5px] leading-tight text-white/70">{l}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 flex items-start gap-2 text-[13px] leading-snug text-white/60"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Protected by a human check and encrypted passwords. Free for students, with no placement fees.</p>
      </aside>

      <main className="auth-side flex flex-col justify-center px-4 py-8 sm:px-10">
        <div className="auth-form relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[28px] p-6 sm:p-9">
          <span className="auth-stripe absolute inset-x-0 top-0 h-1.5" aria-hidden />
          <Link href="/" className="mb-6 flex w-fit items-center gap-2 text-[19px] font-bold tracking-tight text-ink lg:hidden" aria-label="GrowQR home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#ff6a2f] to-[#ec4899] text-white"><QrCode className="h-4 w-4" aria-hidden /></span>
            GrowQR
          </Link>
          <p className="inline-block rounded-full bg-[#7857ff]/10 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-[#5b3fe0]">{eyebrow}</p>
          <h1 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          <p className="mt-8 flex items-start gap-2 text-[12.5px] leading-snug text-ink-4"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> We only use your email to save your progress and send important account emails. No spam, ever.</p>
        </div>
      </main>
    </div>
  );
}

/* ---- provider buttons ---- */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M7.1 9.6H4.5V19h2.6V9.6zM5.8 5.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19.5 13.7c0-2.5-1.3-4.3-3.6-4.3-1.2 0-2.1.6-2.5 1.3V9.6h-2.6V19h2.6v-5.1c0-1.3.6-2.2 1.8-2.2 1.2 0 1.7.9 1.7 2.2V19h2.6v-5.3z" />
    </svg>
  );
}

const MARK: Record<Provider, () => ReactNode> = { google: () => <GoogleMark />, linkedin: () => <LinkedInMark /> };

/** "Continue with Google / LinkedIn". Providers without keys are hidden on the live site and shown (as a preview) in development. */
export function SocialButtons({ role = "student", next = "", verb = "Continue" }: { role?: string; next?: string; verb?: string }) {
  const show = PROVIDERS.filter((p) => providerEnabled(p) || process.env.NODE_ENV !== "production");
  if (!show.length) return null;
  const qs = (p: Provider) => `/auth/${p}?role=${encodeURIComponent(role)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {show.map((p) => (
          <a key={p} href={qs(p)} className="flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl border border-black/[0.14] bg-white px-4 text-[14.5px] font-semibold text-ink transition hover:border-[#7857ff]/50 hover:bg-[#7857ff]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7857ff]">
            {MARK[p]()} {verb} with {providerLabel(p)}
          </a>
        ))}
      </div>
      <div className="my-6 flex items-center gap-3 text-[12.5px] text-ink-4" role="separator" aria-label="or"><span className="h-px flex-1 bg-black/10" /> or use your email <span className="h-px flex-1 bg-black/10" /></div>
    </div>
  );
}

/** Account type tabs on the sign-up page. */
export function RoleTabs({ role }: { role: string }) {
  const tabs: [string, string][] = [["student", "Student"], ["teacher", "Teacher"], ["parent", "Parent"], ["employer", "Employer"]];
  return (
    <nav aria-label="Account type" className="mb-6 grid grid-cols-4 gap-1 rounded-xl bg-cream-2 p-1">
      {tabs.map(([k, l]) => (
        <Link key={k} href={k === "student" ? "/signup" : `/signup?role=${k}`} aria-current={role === k ? "page" : undefined} className={`flex min-h-[40px] items-center justify-center rounded-lg text-[13.5px] font-semibold transition ${role === k ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>{l}</Link>
      ))}
    </nav>
  );
}
