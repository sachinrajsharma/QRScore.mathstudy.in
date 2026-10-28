"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { suggestPassword } from "@/lib/portal/password-suggest";
import { useFormStatus } from "react-dom";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { estimate } from "@/lib/portal/strength";
import { solve } from "./pow";

/** The controls used by the redesigned account pages. */

export type CaptchaInfo = { mode: "off" | "turnstile" | "pow" | "image"; siteKey: string };

const inputBase =
  "w-full rounded-xl border bg-white px-4 py-3 text-[16px] text-ink outline-none transition placeholder:text-ink-4 min-h-[48px] focus:border-[#7857ff] focus:ring-4 focus:ring-[#7857ff]/15 sm:text-[15px]";

export function Notice({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const tone = kind === "error" ? "border-red-200 bg-red-50 text-red-800" : kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#7857ff]/25 bg-[#7857ff]/[0.06] text-ink-2";
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[14px] leading-snug ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function TextField({ label, name, type = "text", icon, error, defaultValue, autoComplete, hint, inputMode, maxLength, autoFocus, placeholder, required = true, onChange }: {
  label: string; name: string; type?: string; icon?: ReactNode; error?: string; defaultValue?: string; autoComplete?: string; hint?: string;
  inputMode?: "text" | "email" | "numeric"; maxLength?: number; autoFocus?: boolean; placeholder?: string; required?: boolean; onChange?: (v: string) => void;
}) {
  const id = `f-${name}`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">{label}</label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden>{icon}</span> : null}
        <input
          id={id} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} required={required} inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus} placeholder={placeholder}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} spellCheck={false} autoCapitalize="none"
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`${inputBase} ${icon ? "pl-11" : ""} ${error ? "border-red-400" : "border-black/[0.14]"}`}
        />
      </div>
      {hint && !error ? <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-ink-4">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="mt-1.5 text-[13px] text-red-700">{error}</p> : null}
    </div>
  );
}

const BAR = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-600"];

export function PasswordInput({ label = "Password", name = "password", icon, error, autoComplete = "current-password", hint, meter = false, email = "", fullName = "", suggest = false }: {
  label?: string; name?: string; icon?: ReactNode; error?: string; autoComplete?: string; hint?: string; meter?: boolean; email?: string; fullName?: string; suggest?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [value, setValue] = useState("");
  const id = `f-${name}`;
  const s = meter ? estimate(value, email, fullName) : null;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">{label}</label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden>{icon}</span> : null}
        <input
          id={id} name={name} type={show ? "text" : "password"} required autoComplete={autoComplete} spellCheck={false} autoCapitalize="none" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} onKeyDown={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} onBlur={() => setCaps(false)}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={`${inputBase} pr-12 ${icon ? "pl-11" : ""} ${error ? "border-red-400" : "border-black/[0.14]"}`}
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute right-1.5 top-1/2 grid h-10 min-w-[3rem] -translate-y-1/2 place-items-center rounded-lg px-2 text-ink-3 hover:text-ink-2">
          <span aria-hidden className="text-[12.5px] font-semibold">{show ? "Hide" : "Show"}</span>
        </button>
      </div>
      {suggest ? <button type="button" onClick={() => { setValue(suggestPassword()); setShow(true); }} className="mt-2 text-[13px] font-semibold text-[#5b3fe0] underline underline-offset-2">Suggest a strong password</button> : null}
      {caps ? <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-amber-700" role="status"><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Caps Lock is on</p> : null}
      {s && value ? (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden>{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= s.score ? BAR[s.score] : "bg-black/10"}`} />)}</div>
          <p className="mt-1.5 text-[12.5px] text-ink-3"><b className="text-ink-2">{s.label}</b>{s.tips.length ? ` · ${s.tips.join(" ")}` : ""}</p>
        </div>
      ) : null}
      {hint && !error && !(s && value) ? <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-ink-4">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="mt-1.5 text-[13px] text-red-700">{error}</p> : null}
    </div>
  );
}

export function GradientButton({ children, pendingText = "Please wait...", disabled = false }: { children: ReactNode; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const off = pending || disabled;
  return (
    <button type="submit" disabled={off} className="group relative flex min-h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl auth-cta px-6 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {pendingText}</> : children}
    </button>
  );
}

/**
 * The human check. Cloudflare Turnstile when the site has keys; otherwise a proof-of-work check that solves itself in the background.
 * `onReady(true)` fires when the form may be submitted. `resetKey` changes after each submit so a spent token is replaced.
 */
export function HumanCheck({ captcha, onReady, resetKey }: { captcha: CaptchaInfo; onReady: (ok: boolean) => void; resetKey?: unknown }) {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [powValue, setPowValue] = useState("");
  const ts = useRef<TurnstileInstance | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [token, setToken] = useState("");
  const [typed, setTyped] = useState("");
  const [imgState, setImgState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => { if (captcha.mode === "off") onReady(true); }, [captcha.mode, onReady]);

  // Picture code: get a fresh signed token at load, after every submit, and when the person asks for a new picture.
  useEffect(() => {
    if (captcha.mode !== "image") return;
    let live = true;
    setImgState("loading"); setTyped(""); setToken(""); onReady(false);
    (async () => {
      try {
        const r = await fetch("/api/auth/captcha", { cache: "no-store" });
        if (!r.ok) throw new Error("captcha");
        const { token: t } = (await r.json()) as { token: string };
        if (live) { setToken(t); setImgState("ready"); }
      } catch {
        if (live) setImgState("error");
      }
    })();
    return () => { live = false; };
  }, [captcha.mode, resetKey, attempt, onReady]);

  useEffect(() => {
    if (captcha.mode !== "pow") return;
    let live = true;
    setState("working"); setPowValue(""); onReady(false);
    (async () => {
      try {
        const r = await fetch("/api/auth/challenge", { cache: "no-store" });
        if (!r.ok) throw new Error("challenge");
        const { challenge, bits } = (await r.json()) as { challenge: string; bits: number };
        const nonce = await solve(challenge, bits);
        if (!live) return;
        setPowValue(`${challenge}~${nonce}`); setState("done"); onReady(true);
      } catch {
        if (live) { setState("error"); onReady(false); }
      }
    })();
    return () => { live = false; };
  }, [captcha.mode, resetKey, attempt, onReady]);

  useEffect(() => { if (captcha.mode === "turnstile") { ts.current?.reset(); onReady(false); } }, [resetKey, captcha.mode, onReady]);

  if (captcha.mode === "off") return null;
  if (captcha.mode === "image") {
    return (
      <div className="mb-5 rounded-2xl border border-black/[0.1] bg-gradient-to-br from-indigo-50/70 via-white to-orange-50/70 p-3.5">
        <label htmlFor="f-captcha" className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2"><ShieldCheck className="h-4 w-4 text-[#5b3fe0]" aria-hidden /> Type the code you see</label>
        <input type="hidden" name="captchaToken" value={token} readOnly />
        <div className="flex items-stretch gap-2.5">
          <div className="relative h-[60px] w-[180px] shrink-0 overflow-hidden rounded-xl border border-black/[0.08] bg-white">
            {imgState === "ready" && token ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/auth/captcha/image?t=${encodeURIComponent(token)}`} alt="Security code: six letters and numbers" width={180} height={60} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-[12.5px] text-ink-4">{imgState === "error" ? "Could not load" : "Loading…"}</span>
            )}
          </div>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-black/[0.14] bg-white px-3 text-ink-3 hover:bg-cream-2" aria-label="Show a new code" title="Show a new code">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <input
          id="f-captcha" name="captcha" value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} inputMode="text" required
          onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); setTyped(v); onReady(v.length === 6 && !!token); }}
          placeholder="Enter the 6 characters"
          className="mt-2.5 w-full rounded-xl border border-black/[0.14] bg-white px-4 py-3 text-[16px] font-semibold uppercase tracking-[0.3em] text-ink outline-none transition placeholder:text-[13px] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-4 focus:border-[#7857ff] focus:ring-4 focus:ring-[#7857ff]/15"
        />
        <p className="mt-1.5 text-[12px] text-ink-4">Letters and numbers, not case sensitive. Can&rsquo;t read it? Press the refresh button.</p>
      </div>
    );
  }
  if (captcha.mode === "turnstile") {
    return (
      <div className="mb-5">
        <div className="flex justify-center"><Turnstile ref={ts} siteKey={captcha.siteKey} options={{ theme: "light", size: "flexible" }} onSuccess={() => onReady(true)} onExpire={() => onReady(false)} onError={() => onReady(false)} /></div>
        <p className="mt-1.5 text-center text-[12px] text-ink-4">Protected by Cloudflare Turnstile</p>
      </div>
    );
  }
  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-black/[0.1] bg-cream-2 px-3.5 py-3" role="status" aria-live="polite">
      <input type="hidden" name="pow" value={powValue} readOnly />
      <span className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
        {state === "done" ? <ShieldCheck className="h-[18px] w-[18px] text-emerald-600" aria-hidden /> : state === "error" ? <AlertCircle className="h-[18px] w-[18px] text-red-600" aria-hidden /> : <Loader2 className="h-[18px] w-[18px] animate-spin text-[#7857ff]" aria-hidden />}
        {state === "done" ? "Security check passed" : state === "error" ? "The security check could not run" : "Running a quick security check…"}
      </span>
      {state === "error" ? <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-black/[0.15] px-3 text-[13px] font-semibold hover:bg-white"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again</button> : null}
    </div>
  );
}

/** A field real people never see; bots fill it. */
export function Trap() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label>Leave this field empty<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
    </div>
  );
}
