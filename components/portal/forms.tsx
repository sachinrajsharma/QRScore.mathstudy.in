"use client";

import { useActionState, useState } from "react";
import { Briefcase, Building2, KeyRound, Lock, Mail, User } from "lucide-react";
import {
  loginAction, mfaLoginAction, signupAction, forgotAction, resetAction, logoutAction, resendVerificationAction, mfaEnableAction, mfaDisableAction, type FormState,
} from "@/app/(portal)/actions";
import { CollegeField } from "./college-field";
import { COLLEGE_STATES } from "./college-states";
import { Alert, Field, LinkText, PasswordField, SubmitButton } from "./ui";
import { GradientButton, HumanCheck, Notice, PasswordInput, TextField, Trap, type CaptchaInfo } from "./auth-controls";

const none: FormState = {};

/** The five account forms below use the redesigned controls. `captcha` says which human check the server expects. */
const off: CaptchaInfo = { mode: "off", siteKey: "" };

export function LoginForm({ next, captcha = off }: { next: string; captcha?: CaptchaInfo }) {
  const [s, action] = useActionState(loginAction, none);
  const [human, setHuman] = useState(false);
  return (
    <form action={action} noValidate>
      {s.error ? <Notice>{s.error}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <Trap />
      <TextField label="Email address" name="email" type="email" inputMode="email" autoComplete="username" icon={<Mail className="h-[18px] w-[18px]" />} defaultValue={s.values?.email} error={s.fields?.email} autoFocus />
      <PasswordInput icon={<Lock className="h-[18px] w-[18px]" />} error={s.fields?.password} />
      <p className="-mt-1 mb-5 text-right text-[13.5px]"><LinkText href="/forgot-password">Forgot your password?</LinkText></p>
      <HumanCheck captcha={captcha} onReady={setHuman} resetKey={s} />
      <GradientButton pendingText="Logging in..." disabled={!human}>Log in</GradientButton>
    </form>
  );
}

export function MfaLoginForm() {
  const [s, action] = useActionState(mfaLoginAction, none);
  return (
    <form action={action} noValidate>
      {s.error ? <Notice>{s.error}</Notice> : null}
      <TextField label="Verification code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={14} autoFocus icon={<KeyRound className="h-[18px] w-[18px]" />} hint="The 6-digit code from your authenticator app, or a recovery code." />
      <GradientButton pendingText="Checking...">Verify and log in</GradientButton>
    </form>
  );
}

/** `scan` is set when the visitor scanned a resume on the home page: their details are pre-filled and the result is saved to the new account. */
export function SignupForm({ role, captcha = off, scan }: { role: "student" | "employer" | "teacher" | "parent"; captcha?: CaptchaInfo; scan?: { name: string; email: string; college: string; publishAvailable: boolean } }) {
  const [s, action] = useActionState(signupAction, none);
  const [human, setHuman] = useState(false);
  const [email, setEmail] = useState(s.values?.email ?? scan?.email ?? "");
  const [name, setName] = useState(s.values?.name ?? scan?.name ?? "");
  const isE = role === "employer";
  const f = s.fields ?? {};
  const v: Record<string, string | undefined> = { ...(scan ? { name: scan.name, email: scan.email, college: scan.college } : {}), ...(s.values ?? {}) };
  return (
    <form action={action} noValidate>
      {s.error ? <Notice>{s.error}</Notice> : null}
      <input type="hidden" name="role" value={role} />
      {scan ? <input type="hidden" name="claim" value="1" /> : null}
      <Trap />
      <TextField label="Full name" name="name" autoComplete="name" icon={<User className="h-[18px] w-[18px]" />} defaultValue={v.name} error={f.name} onChange={setName} />
      <TextField label={isE ? "Work email" : "Email address"} name="email" type="email" inputMode="email" autoComplete="email" icon={<Mail className="h-[18px] w-[18px]" />} defaultValue={v.email} error={f.email} onChange={setEmail} />
      {isE ? (
        <>
          <TextField label="Company" name="company" autoComplete="organization" icon={<Building2 className="h-[18px] w-[18px]" />} defaultValue={v.company} error={f.company} />
          <TextField label="Your role at the company" name="designation" autoComplete="organization-title" icon={<Briefcase className="h-[18px] w-[18px]" />} defaultValue={v.designation} error={f.designation} />
        </>
      ) : role === "student" ? (
        <CollegeField defaultValue={v.college} error={f.college} states={COLLEGE_STATES} />
      ) : null}
      <PasswordInput label="Create a password" autoComplete="new-password" icon={<Lock className="h-[18px] w-[18px]" />} error={f.password} meter suggest email={email} fullName={name} hint="At least 8 characters. A short phrase of unrelated words works well." />
      <div className="mb-5">
        <label className="flex min-h-[44px] items-start gap-3 text-[13.5px] text-ink-3">
          <input type="checkbox" name="terms" className="mt-1 h-5 w-5 shrink-0 accent-[#7857ff]" required />
          <span>I agree to the <LinkText href="/privacy-policy">Privacy Policy</LinkText> and terms of use.</span>
        </label>
        {f.terms ? <p className="mt-1 text-[13px] text-red-700">{f.terms}</p> : null}
      </div>
      {scan?.publishAvailable ? (
        <div className="mb-5">
          <label className="flex min-h-[44px] items-start gap-3 text-[13.5px] text-ink-3">
            <input type="checkbox" name="publish" defaultChecked className="mt-1 h-5 w-5 shrink-0 accent-[#7857ff]" />
            <span>Make my QR Score verifiable. Anyone who scans my QR code sees my first name, last initial and score, and nothing else. I can turn this off any time.</span>
          </label>
        </div>
      ) : null}
      {scan ? <p className="mb-4 text-[12.5px] leading-snug text-ink-4">We will save the resume you just scanned to your account. Until you create it, we keep your scan for up to 24 hours and then delete it.</p> : null}
      <HumanCheck captcha={captcha} onReady={setHuman} resetKey={s} />
      <GradientButton pendingText="Creating your account..." disabled={!human}>{scan ? "Save my score and create my account" : "Create account"}</GradientButton>
      {!human && captcha.mode !== "off" ? (
        <p role="status" className="mt-3 text-center text-[13px] leading-snug text-ink-3">
          {captcha.mode === "image" ? "The button is grey until you type the 6 characters from the picture above." : "Checking that you are a person. This takes a moment, then the button turns on."}
        </p>
      ) : null}
    </form>
  );
}

export function ForgotForm({ captcha = off }: { captcha?: CaptchaInfo }) {
  const [s, action] = useActionState(forgotAction, none);
  const [human, setHuman] = useState(false);
  if (s.ok) {
    return (
      <Notice kind="success">
        If an account exists for <b>{s.values?.email}</b>, we have sent a link to reset the password. It works once and lasts 60 minutes. Check your spam folder if it does not arrive.
      </Notice>
    );
  }
  return (
    <form action={action} noValidate>
      {s.error ? <Notice>{s.error}</Notice> : null}
      <Trap />
      <TextField label="Email address" name="email" type="email" inputMode="email" autoComplete="email" icon={<Mail className="h-[18px] w-[18px]" />} defaultValue={s.values?.email} error={s.fields?.email} autoFocus />
      <HumanCheck captcha={captcha} onReady={setHuman} resetKey={s} />
      <GradientButton pendingText="Sending..." disabled={!human}>Send reset link</GradientButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, action] = useActionState(resetAction, none);
  return (
    <form action={action} noValidate>
      {s.error ? <Notice>{s.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <PasswordInput label="New password" autoComplete="new-password" icon={<Lock className="h-[18px] w-[18px]" />} meter hint="At least 8 characters. A short phrase of unrelated words works well." />
      <GradientButton pendingText="Saving...">Save new password</GradientButton>
    </form>
  );
}

export function ResendVerification() {
  const [s, action] = useActionState(resendVerificationAction, none);
  return (
    <form action={action}>
      {s.error ? <Alert>{s.error}</Alert> : null}
      {s.ok ? <Alert kind="success">{s.message}</Alert> : null}
      <SubmitButton pendingText="Sending...">Send me a new link</SubmitButton>
    </form>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button type="submit" className={className || "min-h-[44px] px-4 rounded-lg border border-black/[0.15] text-[14px] font-medium text-ink-2 hover:bg-cream-2"}>Log out</button>
    </form>
  );
}

export function MfaEnableForm() {
  const [s, action] = useActionState(mfaEnableAction, none);
  if (s.ok && s.codes) {
    return (
      <div>
        <Alert kind="success">Two-step verification is on.</Alert>
        <h2 className="text-[16px] font-semibold text-ink mb-2">Save your recovery codes</h2>
        <p className="text-[14px] text-ink-3 mb-4">If you lose your phone, each of these codes lets you log in once. They are shown only now: store them somewhere safe.</p>
        <ul className="grid grid-cols-2 gap-x-6 font-mono text-[15px] leading-8 mb-6">{s.codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <a href="/account" className="inline-flex items-center justify-center w-full min-h-[48px] rounded-lg bg-orange hover:bg-orange-dark text-white font-semibold text-[15px]">Continue</a>
      </div>
    );
  }
  return (
    <form action={action} noValidate>
      {s.error ? <Alert>{s.error}</Alert> : null}
      <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus />
      <SubmitButton pendingText="Checking...">Turn on two-step verification</SubmitButton>
    </form>
  );
}

export function MfaDisableForm() {
  const [s, action] = useActionState(mfaDisableAction, none);
  if (s.ok) return <Alert kind="success">{s.message}</Alert>;
  return (
    <form action={action} noValidate>
      {s.error ? <Alert>{s.error}</Alert> : null}
      <PasswordField />
      <Field label="Current code or recovery code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={14} />
      <SubmitButton pendingText="Checking...">Turn off</SubmitButton>
    </form>
  );
}
