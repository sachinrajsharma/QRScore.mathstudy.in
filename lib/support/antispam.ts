/**
 * Support anti-spam: the scoring rules, as pure functions (no database, no request).
 * Layers used together on the public ticket form: honeypot field, time trap, human check (see lib/portal/captcha), this score,
 * the sender blocklist and per-IP limits. Port of the stand-alone support-ticket-system's lib/antispam.js and spamScore().
 */
export const SPAM_QUARANTINE = 8; // score at or above: kept, but hidden in the spam folder, no emails sent
export const SPAM_DROP = 10; // score at or above: dropped silently, the sender sees a normal confirmation

export interface SpamInput { honeypot?: string; description: string; subject: string; name: string; email: string; tooFast: boolean }

const urlRe = /https?:\/\/|www\./gi;
export const countLinks = (text: string): number => (String(text ?? "").match(urlRe) ?? []).length;

/** A filled hidden field means a bot: people never see it. */
export const honeypotHit = (value: unknown): boolean => String(value ?? "").trim() !== "";

/** The form carries the time it was rendered. No timestamp (a direct POST) or an inhumanly fast return is a bot. */
export function tooFast(formTs: unknown, now: number = Date.now(), minSeconds = 4): boolean {
  const ts = parseInt(String(formTs ?? ""), 10);
  if (!ts || !Number.isFinite(ts)) return true;
  const age = (now - ts) / 1000;
  return age >= 0 && age < minSeconds;
}

const PROMO = /\b(our|my)\s+(website|site|product|app|platform|service|company|agency|store|course|tool)s?\b|\bwe\s+(offer|provide|are\s+(a|an|the)|specialize|help\s+(you|businesses|students))\b|\b(visit|check\s*out|try)\s+(us|our|my)\b|\b(free\s+trial|special\s+offer|limited\s+(time\s+)?offer|discount\s+code|promo\s*code|collaborat(e|ion)|partnership|affiliate|digital\s+marketing|web\s*(site)?\s*(design|development)|increase\s+(your\s+)?(traffic|sales|revenue)|grow\s+your|boost\s+your|rank\s+(on|higher)|lead\s*generation|business\s+proposal)\b/i;

/** Heuristic score; see SPAM_QUARANTINE and SPAM_DROP. */
export function spamScore({ honeypot, description, subject, name, email, tooFast: fast }: SpamInput): number {
  let s = 0;
  const d = String(description ?? ""), sub = String(subject ?? ""), n = String(name ?? "");
  const all = `${n} ${sub} ${d}`;
  if (honeypot && String(honeypot).trim() !== "") s += 10; // a bot filled the hidden field
  if (fast) s += 10; // no page load, or inhuman speed
  if (/https?:\/\/|www\./i.test(n)) s += 10; // a URL inside the "name"
  if (/\d{5,}/.test(n)) s += 6; // long digit runs in a name
  if (n.length > 60 || n.trim().split(/\s+/).length > 6) s += 4; // names are short
  const links = countLinks(all);
  if (links >= 3) s += 6; else if (links >= 1) s += 2;
  if (d.trim().length < 15) s += 2;
  if (n.trim().length >= 12 && d.includes(n.trim().slice(0, 40))) s += 6; // the name repeated in the body is template spam
  if (/thank you (very much )?for your (inquiry|enquiry)|we appreciate you/i.test(all)) s += 8;
  if (/viagra|casino|crypto\s*invest|loan\s*offer|seo\s*service|backlinks?|guest\s*post|porn|escort/i.test(all)) s += 6;
  if (/[Ѐ-ӿ]{5,}/.test(all)) s += 4; // Cyrillic bursts (the audience is Indian / English)
  if (email && /\s/.test(String(email))) s += 10; // whitespace inside an email
  if (PROMO.test(all)) s += links >= 1 ? 8 : 4; // someone advertising their own product: promo wording with a link is quarantined
  return s;
}

/** Free mail providers share one domain between innocent people, so blocking a domain never applies to them. */
export const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "rediffmail.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "ymail.com"]);
export const emailDomain = (email: string): string => String(email ?? "").toLowerCase().split("@")[1] ?? "";
