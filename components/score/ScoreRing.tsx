/** The QR Score as a ring: the number in the middle, the grade under it. Pure SVG, no script, readable by screen readers through the label. */
export function ScoreRing({ score, grade, size = 168, dark = false }: { score: number; grade?: string; size?: number; dark?: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const id = `sr-${Math.round(score * 10)}-${size}`;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`QR Score ${score} out of 100${grade ? `, ${grade}` : ""}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#7857ff" /><stop offset="0.55" stopColor="#ec4899" /><stop offset="1" stopColor="#ff6a2f" /></linearGradient></defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke={dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.08)"} strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <div className="text-center" aria-hidden>
        <p className={`font-bold leading-none ${dark ? "text-white" : "text-ink"}`} style={{ fontSize: size * 0.28 }}>{Math.round(score)}</p>
        <p className={`mt-1 ${dark ? "text-white/60" : "text-ink-3"}`} style={{ fontSize: size * 0.085 }}>out of 100</p>
        {grade ? <p className="mt-1 font-semibold text-[#ec4899]" style={{ fontSize: size * 0.1 }}>{grade}</p> : null}
      </div>
    </div>
  );
}
