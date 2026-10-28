import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Briefcase, BookOpen, FileText, Globe2, GraduationCap, Mic, Rocket, Target } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { ScoreRing } from "@/components/score/ScoreRing";
import { SignupForm } from "@/components/portal/forms";
import { captchaMode, turnstileSiteKey } from "@/lib/portal/captcha";
import { getSession } from "@/lib/portal/session";
import { available as signingAvailable } from "@/lib/portal/passport/credential";
import { readGuest } from "@/lib/qrscore/guest";
import "@/components/portal/auth.css";

export const metadata: Metadata = { title: "Your QR Score | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UNLOCK = [
  [FileText, "Resume Studio", "Fix what is holding your score back"],
  [BookOpen, "Courses", "Picked from your resume"],
  [Rocket, "Internships", "Matched to your skills"],
  [Briefcase, "Jobs", "Roles you are ready for"],
  [Mic, "Interview practice", "AI mock interviews"],
  [Target, "Online tests", "Practice and exam prep"],
  [GraduationCap, "Plans", "Courses and expert help"],
  [Globe2, "Study abroad", "Universities and packages"],
] as const;

const tone = (pct: number): string => (pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500");

export default async function ScorePage() {
  const s = await getSession();
  if (s?.user?.role === "student") redirect("/passport");
  const g = readGuest(s?.data);
  if (!g) redirect("/#resume-drop");
  const first = g.name?.split(" ")[0] ?? null;
  const mode = captchaMode();
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-4">Your result</p>
        <h1 className="mt-1 text-[clamp(1.9rem,4vw,2.8rem)] font-bold leading-tight tracking-tight text-ink">{first ? `${first}, here is your QR Score.` : "Here is your QR Score."}</h1>
        <p className="mt-2 max-w-[44em] text-ink-3">We read {g.fileName ? <b className="font-semibold text-ink-2">{g.fileName}</b> : "your resume"} and scored it on five areas. It takes the same rules for everyone and no AI is used to decide the score.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="space-y-6">
            <section aria-labelledby="sc-h" className="rounded-3xl bg-gradient-to-br from-[#1a0b4a] via-[#3b1190] to-[#6a1fa8] p-6 text-white shadow-card sm:p-8">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
                <ScoreRing score={g.score} grade={g.grade} size={176} dark />
                <div className="min-w-0 flex-1">
                  <h2 id="sc-h" className="text-[1.3rem] font-semibold text-white">Your QR Score: {Math.round(g.score)} / 100</h2>
                  <p className="mt-1 text-white/70">{g.grade}. Your resume reads as a <b className="text-white">{g.stage}</b> profile in <b className="text-white">{g.domain.label}</b>.</p>
                  <ul className="mt-4 space-y-2.5" aria-label="Score by area">
                    {g.sections.filter((x) => x.applicable).map((x) => {
                      const pct = x.max ? (x.score / x.max) * 100 : 0;
                      return (
                        <li key={x.id}>
                          <div className="flex justify-between text-[0.82rem]"><span>{x.name}</span><span className="text-white/70">{Math.round(x.score)} / {x.max}</span></div>
                          <div className="mt-1 h-2 rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={x.name}><span className={`block h-full rounded-full ${tone(pct)}`} style={{ width: `${pct}%` }} /></div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>

            <section aria-labelledby="fx-h" className="rounded-3xl border border-black/[0.08] bg-white p-6 shadow-card sm:p-8">
              <h2 id="fx-h" className="text-[1.2rem] font-semibold text-ink">Three things that would raise it most</h2>
              <ol className="mt-4 space-y-4">
                {g.advice.map((a, i) => (
                  <li key={a.title} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-lighter text-[0.9rem] font-bold text-orange-deep" aria-hidden>{i + 1}</span>
                    <div><h3 className="font-semibold text-ink">{a.title}</h3><p className="mt-0.5 text-[0.92rem] leading-relaxed text-ink-3">{a.text}</p></div>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="un-h" className="rounded-3xl border border-black/[0.08] bg-cream-2 p-6 sm:p-8">
              <h2 id="un-h" className="text-[1.2rem] font-semibold text-ink">After you save your score, your dashboard fills with</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {UNLOCK.map(([Icon, t, d]) => (
                  <li key={t} className="flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-sm">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#7857ff]/10 text-[#5b3fe0]"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span><b className="block text-[0.95rem] text-ink">{t}</b><span className="text-[0.84rem] text-ink-3">{d}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside id="save" aria-labelledby="sv-h" className="h-fit rounded-3xl border border-[#7857ff]/20 bg-white p-6 shadow-card sm:p-8 lg:sticky lg:top-28">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#7857ff]/10 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[#5b3fe0]"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Free account</p>
            <h2 id="sv-h" className="mt-3 text-[1.4rem] font-bold leading-tight text-ink">Save your score and get your QR ID</h2>
            <p className="mb-5 mt-1.5 text-[0.9rem] leading-relaxed text-ink-3">You get a unique ID built from your name, a QR code that proves your score, and a dashboard of courses, internships, jobs and practice picked for you. You choose your own password.</p>
            <SignupForm role="student" captcha={{ mode, siteKey: mode === "turnstile" ? turnstileSiteKey() : "" }} scan={{ name: g.name ?? "", email: g.email ?? "", college: g.college ?? "", publishAvailable: signingAvailable() }} />
            <p className="mt-4 text-center text-[0.82rem] text-ink-3">Already registered? <Link href="/login" className="font-semibold text-[#5b3fe0] underline underline-offset-2">Log in</Link> · <Link href="/#resume-drop" className="font-semibold text-[#5b3fe0] underline underline-offset-2">Scan a different resume</Link></p>
          </aside>
        </div>
      </main>
    </PageShell>
  );
}
