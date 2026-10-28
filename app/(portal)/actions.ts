"use server";

import { redirect } from "next/navigation";
import * as auth from "@/lib/portal/auth";
import { enableMfa, disableMfa } from "@/lib/portal/auth";
import { humanCheck } from "@/lib/portal/captcha";
import { PWNED_MESSAGE, pwnedCount } from "@/lib/portal/pwned";
import { clientIp, audit, safeNext } from "@/lib/portal/security";
import { weakPassword } from "@/lib/portal/password";
import { getSession, startSession, endSession, endAllSessions, dropSessionData } from "@/lib/portal/session";
import * as totp from "@/lib/portal/totp";
import { verifyPasswordFor } from "@/lib/portal/auth";
import { submit as submitCollege } from "@/lib/portal/colleges";
import { readGuest } from "@/lib/qrscore/guest";
import { attachGuestScan } from "@/lib/qrscore/claim";

/**
 * Server Actions behind the account forms. Next.js checks that each request comes from this site (same-origin), which is the
 * CSRF protection; on top of that every action re-validates its input on the server, never trusting the browser.
 */
export interface FormState {
  error?: string;
  /** field name -> message */
  fields?: Record<string, string>;
  /** what the person typed (never passwords), so the form can be shown again */
  values?: Record<string, string>;
  ok?: boolean;
  message?: string;
  codes?: string[];
}

const FREE_MAIL = ["gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "rediffmail.com", "live.com", "icloud.com", "proton.me", "protonmail.com"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (fd: FormData, k: string, max = 190): string => String(fd.get(k) ?? "").trim().slice(0, max);

async function passesBotChecks(fd: FormData, label: string): Promise<boolean> {
  if (str(fd, "website") !== "") return false; // honeypot: real people never see this field
  return humanCheck(fd, label); // Cloudflare Turnstile when configured, otherwise the built-in proof-of-work check
}

const BOT_MSG = "We could not confirm you are human. Please try again.";

// ---- log in --------------------------------------------------------------------------------------------------------

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  const password = String(fd.get("password") ?? "");
  const next = str(fd, "next", 300);
  const values = { email };
  if (!(await passesBotChecks(fd, "login"))) return { error: BOT_MSG, values };
  const fields: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) fields.email = "Enter a valid email address.";
  if (password === "") fields.password = "Enter your password.";
  if (Object.keys(fields).length) return { fields, values };

  const r = await auth.attempt(email, password, await clientIp());
  if (!r.ok) return { error: r.error, values };
  if (r.user.mfa_enabled_at) {
    await startSession(null, { mfa_uid: r.user.id, mfa_t: Date.now(), mfa_next: next });
    redirect("/login/mfa");
  }
  await startSession(r.user.id);
  await audit(r.user.id, r.user.id, "login", "");
  redirect(safeNext(next, auth.homeFor(r.user.role)));
}

export async function mfaLoginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  const pending = await auth.pendingMfaUser(Number(s?.data.mfa_uid ?? 0) || null, Number(s?.data.mfa_t ?? 0) || null);
  if (!pending) redirect("/login");
  const err = await auth.checkMfaCode(pending.id, str(fd, "code", 40));
  if (err) return { error: err };
  const next = String(s?.data.mfa_next ?? "");
  await startSession(pending.id); // a fresh session replaces the parked one
  await audit(pending.id, pending.id, "login.mfa", "");
  redirect(safeNext(next, auth.homeFor(pending.role)));
}

// ---- sign up -------------------------------------------------------------------------------------------------------

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const asked = str(fd, "role");
  const role = asked === "employer" || asked === "teacher" || asked === "parent" ? asked : "student";
  const isE = role === "employer";
  const isStudent = role === "student";
  const v = { name: str(fd, "name", 120), email: str(fd, "email"), college: str(fd, "college", 160), company: str(fd, "company", 160), designation: str(fd, "designation", 160) };
  const password = String(fd.get("password") ?? "");
  const values = { ...v, role };
  if (!(await passesBotChecks(fd, "signup"))) return { error: BOT_MSG, values };

  const f: Record<string, string> = {};
  if (Array.from(v.name).length < 2) f.name = "Enter your full name.";
  if (!EMAIL_RE.test(v.email)) f.email = "Enter a valid email address.";
  else if (isE && FREE_MAIL.includes(v.email.slice(v.email.lastIndexOf("@") + 1).toLowerCase())) f.email = "Employers need a work email on a company domain. This helps us verify you.";
  const why = weakPassword(password, v.email, v.name);
  if (why) f.password = why;
  else if ((await pwnedCount(password)) > 0) f.password = PWNED_MESSAGE;
  if (isStudent && Array.from(v.college).length < 2) f.college = "Enter your college or university.";
  if (isE) {
    if (Array.from(v.company).length < 2) f.company = "Enter your company name.";
    if (Array.from(v.designation).length < 2) f.designation = "Enter your role at the company.";
  }
  if (fd.get("terms") !== "on") f.terms = "Please accept the terms to continue.";
  if (Object.keys(f).length) return { fields: f, values };

  const r = await auth.register({ role, name: v.name, email: v.email, password, college: v.college, company: v.company }, await clientIp());
  if (!r.ok) return { error: r.error, values };
  if (isStudent && str(fd, "college_state") !== "") await submitCollege(r.userId, await clientIp(), v.college, str(fd, "college_state"), "", false).catch(() => undefined); // an unlisted college goes to admin review
  // A visitor who scanned a resume on the home page keeps their result: read it before the new session replaces the anonymous one.
  const guest = isStudent && fd.get("claim") === "1" ? readGuest((await getSession())?.data) : null;
  await startSession(r.userId);
  await audit(r.userId, r.userId, "signup", role);
  if (guest) {
    try {
      await attachGuestScan(r.userId, v.name, guest, { publish: fd.get("publish") === "on" });
      await audit(r.userId, r.userId, "signup.scan_saved", String(guest.score));
    } catch (e) {
      console.error("[signup] saving the scanned resume failed:", (e as Error).message); // the account still exists; they can score again from the dashboard
    }
  }
  redirect(`${auth.homeFor(role)}?welcome=1${guest ? "&scan=1" : ""}`);
}

// ---- password reset ------------------------------------------------------------------------------------------------

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email");
  if (!(await passesBotChecks(fd, "forgot"))) return { error: BOT_MSG, values: { email } };
  if (!EMAIL_RE.test(email)) return { fields: { email: "Enter a valid email address." }, values: { email } };
  await auth.requestReset(email, await clientIp()); // silent: never reveals whether the email exists
  return { ok: true, values: { email } };
}

export async function resetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token", 80);
  const password = String(fd.get("password") ?? "");
  if ((await pwnedCount(password)) > 0) return { error: PWNED_MESSAGE };
  const r = await auth.completeReset(token, password);
  if (!r.ok) return { error: r.error };
  await endAllSessions(r.userId); // a reset signs the account out everywhere
  await audit(r.userId, r.userId, "password.reset", "");
  redirect("/login?reset=1");
}

// ---- session -------------------------------------------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  const s = await getSession();
  if (s?.user) await audit(s.user.id, s.user.id, "logout", "");
  await endSession();
  redirect("/login?out=1");
}

// ---- email verification --------------------------------------------------------------------------------------------

export async function confirmEmailAction(fd: FormData): Promise<void> {
  const token = str(fd, "token", 80);
  const done = await auth.confirmVerification(token);
  redirect(done ? "/verify-email?done=1" : "/verify-email?token=invalid");
}

export async function resendVerificationAction(_prev: FormState): Promise<FormState> {
  const s = await getSession();
  if (!s?.user) redirect("/login");
  const err = await auth.resendVerification(s.user);
  return err ? { error: err } : { ok: true, message: "We sent you a new link. It may take a minute to arrive." };
}

// ---- two-step login settings ---------------------------------------------------------------------------------------

export async function mfaEnableAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s?.user) redirect("/login");
  if (s.user.mfa_enabled_at) return { error: "Two-step verification is already on." };
  const secret = String(s.data.mfa_setup_secret ?? "");
  if (secret === "" || totp.verify(secret, str(fd, "code", 20)) === null) return { error: "That code did not match. Wait for a fresh code from your app and try again." };
  const codes = await enableMfa(s.user.id, secret);
  await dropSessionData("mfa_setup_secret");
  await audit(s.user.id, s.user.id, "mfa.enable", "");
  return { ok: true, codes };
}

export async function mfaDisableAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s?.user) redirect("/login");
  if (!s.user.mfa_enabled_at) return {};
  if (auth.mfaRequiredFor(s.user)) return { error: "Staff accounts must keep two-step verification on." };
  if (!(await verifyPasswordFor(s.user.id, String(fd.get("password") ?? "")))) return { error: "Your password is not correct." };
  const err = await auth.checkMfaCode(s.user.id, str(fd, "code", 40));
  if (err) return { error: err };
  await disableMfa(s.user.id);
  await audit(s.user.id, s.user.id, "mfa.disable", "");
  return { ok: true, message: "Two-step verification is now off." };
}
