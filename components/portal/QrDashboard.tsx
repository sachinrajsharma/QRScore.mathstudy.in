import Link from "next/link";
import { ArrowRight, BookOpen, Briefcase, Copy, FileText, Globe2, GraduationCap, Mic, QrCode, Rocket, Sparkles, Target, type LucideIcon } from "lucide-react";
import { Card } from "@/components/portal/shell";
import { ScoreRing } from "@/components/score/ScoreRing";
import { one } from "@/lib/portal/db";
import * as passport from "@/lib/portal/passport/profile";
import { qrSvg } from "@/lib/portal/passport/qr";
import * as share from "@/lib/portal/passport/share";
import { available as signingAvailable } from "@/lib/portal/passport/credential";
import { assignQrId } from "@/lib/qrscore/claim";
import { cleanSkills, coursesOf, sectionsOf } from "@/lib/qrscore/guest";
import { buildNextSteps, type GroupKey } from "@/lib/nextsteps";

const ICON: Record<GroupKey, LucideIcon> = { improve: FileText, learn: BookOpen, internships: Rocket, jobs: Briefcase, interview: Mic, tests: Target, plans: GraduationCap, abroad: Globe2 };
const tone = (pct: number): string => (pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500");

/**
 * The top of a student's dashboard: their QR Score with its QR code and readable QR ID, then every GrowQR service worth doing next, ordered by what their
 * own resume needs. Without a scored resume it asks for one first; the rest of the dashboard is unchanged.
 */
export default async function QrDashboard({ userId, name, justSaved = false }: { userId: number; name: string; justSaved?: boolean }) {
  const p = await passport.profile(userId);
  if (!p?.rq) {
    return (
      <Card title="Your QR Score">
        <p className="text-[15px] text-ink-3 mb-4">Upload your resume to get your QR Score, your QR code and a dashboard of courses, internships, jobs and practice picked for you.</p>
        <Link href="/passport" className="inline-flex min-h-[48px] items-center rounded-lg bg-orange px-5 font-semibold text-white hover:bg-orange-dark">Score my resume</Link>
      </Card>
    );
  }
  const rq = p.rq;
  const sections = sectionsOf(rq);
  // A missing QR ID (or a database that has not been migrated yet) must never break the dashboard: the card simply leaves the ID out.
  const qrId = await assignQrId(userId, name).catch(() => one<{ qr_id: string | null }>("SELECT qr_id FROM student_profiles WHERE user_id = $1", [userId]).then((r) => r?.qr_id ?? "").catch(() => ""));
  const row = await share.forUser(userId);
  const live = row && row.is_public === 1;
  const svg = live ? await qrSvg(await share.url(row.code, true), 196) : "";
  const groups = buildNextSteps({ score: rq.overall.score, sections, domainKey: rq.domain.key, domainLabel: rq.domain.label, stage: rq.career.stage, skills: cleanSkills(p.skills), courses: coursesOf(rq) });
  const score = Math.round(rq.overall.score * 10) / 10;

  return (
    <>
      {justSaved ? (
        <div role="status" className="mb-5 flex gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3.5 text-[0.95rem] text-emerald-950">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p><b>Your score is saved.</b> This is your QR ID{qrId ? <> <span className="font-mono font-bold">{qrId}</span></> : null}. Keep it: it is how your QR code and your passport are named. Everything below is picked for you.</p>
        </div>
      ) : null}

      <section aria-labelledby="qd-h" className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a0b4a] via-[#3b1190] to-[#6a1fa8] p-6 text-white shadow-card sm:p-8">
        <div className="grid items-center gap-8 md:grid-cols-[auto,1fr,auto]">
          <ScoreRing score={score} grade={rq.grade} size={170} dark />
          <div className="min-w-0">
            <p className="text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-[#ffd7bd]">Your QR Score</p>
            <h2 id="qd-h" className="mt-1 text-[1.5rem] font-bold leading-tight text-white">{Math.round(score)} / 100 · {rq.grade}</h2>
            <p className="mt-1 text-white/70">A <b className="text-white">{rq.career.stage}</b> profile in <b className="text-white">{rq.domain.label}</b>.</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Score by area">
              {sections.filter((x) => x.applicable).map((x) => {
                const pct = x.max ? (x.score / x.max) * 100 : 0;
                return (
                  <li key={x.id}>
                    <div className="flex justify-between text-[0.78rem]"><span>{x.name}</span><span className="text-white/65">{Math.round(x.score)}/{x.max}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/15"><span className={`block h-full rounded-full ${tone(pct)}`} style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/studio" className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 text-[0.9rem] font-semibold text-ink hover:bg-white/90">Improve my resume</Link>
              <Link href="/passport" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/30 px-4 text-[0.9rem] font-semibold text-white hover:bg-white/10">Score a new version</Link>
            </div>
          </div>
          <div className="mx-auto w-[220px] rounded-2xl bg-white p-3 text-center text-ink">
            {live ? (
              <>
                <div dangerouslySetInnerHTML={{ __html: svg }} />
                <p className="mt-1 text-[0.72rem] text-ink-3">Scan to verify this score</p>
              </>
            ) : (
              <div className="grid min-h-[196px] place-items-center px-2">
                <div>
                  <QrCode className="mx-auto h-10 w-10 text-ink-4" aria-hidden />
                  <p className="mt-2 text-[0.84rem] text-ink-3">{signingAvailable() ? "Turn on your QR code so anyone can check your score." : "Your QR code needs passport signing to be set up on this server."}</p>
                  {signingAvailable() ? <Link href="/passport/share" className="mt-2 inline-block text-[0.84rem] font-semibold text-[#5b3fe0] underline">Turn on my QR code</Link> : null}
                </div>
              </div>
            )}
            {qrId ? <p className="mt-2 flex items-center justify-center gap-1.5 border-t border-black/[0.08] pt-2 font-mono text-[0.9rem] font-bold" title="Your QR ID"><Copy className="h-3.5 w-3.5 text-ink-4" aria-hidden />{qrId}</p> : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="ns-h" className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ns-h" className="text-[1.25rem] font-bold text-ink">What to do next</h2>
          <p className="text-[0.85rem] text-ink-3">Picked from your resume, with the biggest wins first. Listings marked Sample are for demonstration.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const Icon = ICON[g.key];
            return (
              <article key={g.key} className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-card">
                <header className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7857ff]/10 text-[#5b3fe0]"><Icon className="h-5 w-5" aria-hidden /></span>
                  <div><h3 className="text-[1.05rem] font-semibold text-ink">{g.title}</h3><p className="text-[0.82rem] text-ink-3">{g.blurb}</p></div>
                </header>
                <ul className="mt-3 divide-y divide-black/[0.06]">
                  {g.steps.map((st) => (
                    <li key={st.title} className="py-3">
                      <div className="min-w-0">
                        <p className="text-[0.95rem] font-semibold text-ink">{st.title}{st.sample ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-amber-900">Sample</span> : null}</p>
                        <p className="text-[0.84rem] leading-snug text-ink-3">{st.why}</p>
                        {st.tag ? <p className="mt-0.5 text-[0.78rem] text-ink-4">{st.tag}</p> : null}
                      </div>
                      <Link href={st.href} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-black/[0.15] px-3.5 text-[0.85rem] font-semibold text-ink hover:bg-cream-2">{st.cta}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
