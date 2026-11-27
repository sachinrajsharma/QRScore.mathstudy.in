import { z } from "zod";

/** Support tickets: the vocabulary and the rules, as pure data and functions (no database). */
export const CATEGORIES = [
  { id: "billing", label: "Billing and payments", priority: "high" },
  { id: "account", label: "Account and login", priority: "high" },
  { id: "courses", label: "Courses and learning", priority: "medium" },
  { id: "internships", label: "Internships and applications", priority: "medium" },
  { id: "abroad", label: "Study abroad", priority: "medium" },
  { id: "technical", label: "Something is not working", priority: "high" },
  { id: "feedback", label: "Feedback or an idea", priority: "low" },
  { id: "other", label: "Something else", priority: "low" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const defaultPriority = (id: string): Priority => (CATEGORIES.find((c) => c.id === id)?.priority ?? "medium") as Priority;

export const STATUSES = ["open", "pending", "waiting_user", "resolved", "closed"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { open: "Open", pending: "In progress", waiting_user: "Waiting for you", resolved: "Resolved", closed: "Closed" };
/** The same states as staff see them (waiting_user is waiting on the customer). */
export const STAFF_STATUS_LABEL: Record<Status, string> = { ...STATUS_LABEL, waiting_user: "Waiting for customer" };

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

export const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSES as readonly string[]).includes(s);
export const isPriority = (s: unknown): s is Priority => typeof s === "string" && (PRIORITIES as readonly string[]).includes(s);

/** Limits: how many tickets a person may open per hour and keep open at once, and when idle tickets close themselves. */
export const LIMITS = { perHour: 5, openAtOnce: 10, repliesPerHour: 20, idleCloseDays: 7, resolvedCloseDays: 7, perIpPerHour: 5 } as const;

/** Hours a waiting or resolved ticket may stay quiet before it closes itself. SUPPORT_TICKET_TTL_HOURS overrides the default of 7 days. */
export function idleCloseHours(env: string | undefined = process.env.SUPPORT_TICKET_TTL_HOURS): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : LIMITS.idleCloseDays * 24;
}

export const ticketNo = (id: number, now: Date = new Date()): string => `SUP-${now.getUTCFullYear()}-${String(id).padStart(6, "0")}`;
export const isTicketNo = (s: string): boolean => /^SUP-\d{4}-\d{6}$/.test(s);

const clean = (s: string): string => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

export const newTicketSchema = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]], { message: "Choose what your ticket is about." }),
  subject: z.string().transform(clean).pipe(z.string().min(5, "Give a short subject (at least 5 characters).").max(160, "Keep the subject under 160 characters.")),
  related_ref: z.string().transform(clean).pipe(z.string().max(80, "That reference is too long.")).default(""),
  body: z.string().transform(clean).pipe(z.string().min(15, "Describe the problem in at least 15 characters.").max(8000, "Please keep it under 8,000 characters.")),
});
export type NewTicket = z.infer<typeof newTicketSchema>;

/** A ticket from someone who is not signed in: the same fields plus who they are. The email is where the private link is sent. */
export const guestTicketSchema = newTicketSchema.extend({
  name: z.string().transform(clean).pipe(z.string().min(2, "Please enter your full name.").max(120, "That name is too long.")
    .refine((n) => !/https?:\/\/|www\./i.test(n) && !/\d{5,}/.test(n), "Please enter your real name (no links or long numbers).")),
  email: z.string().transform((v) => clean(v).toLowerCase()).pipe(z.string().max(190).regex(/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i, "Please enter a valid email address.")),
  phone: z.string().transform(clean).pipe(z.string().max(30).refine((p) => p === "" || /^[+\d][\d\s-]{6,20}$/.test(p), "That mobile number does not look right.")).default(""),
});
export type GuestTicket = z.infer<typeof guestTicketSchema>;

/** A guest reaches their ticket only through this 48-character random token. */
export const isAccessToken = (s: string): boolean => /^[a-f0-9]{48}$/.test(s);

/** Merge target: a ticket number typed by staff. */
export const normaliseTicketNo = (s: string): string => s.trim().toUpperCase();

export const replySchema = z.object({ body: z.string().transform(clean).pipe(z.string().min(2, "Write your reply.").max(8000, "Please keep it under 8,000 characters.")) });

export const ratingSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().transform(clean).pipe(z.string().max(500)).default("") });

/** Status after a person replies: a resolved or waiting ticket reopens; a closed ticket stays closed (they open a new one). */
export function statusAfterUserReply(s: Status): Status | null {
  if (s === "closed") return null;
  return s === "resolved" || s === "waiting_user" ? "open" : s;
}

/** Status after staff reply publicly: an open ticket now waits for the person. */
export const statusAfterStaffReply = (s: Status): Status => (s === "open" ? "waiting_user" : s);

export const canUserReply = (s: Status): boolean => s !== "closed";
export const canRate = (s: Status, rating: number | null): boolean => (s === "resolved" || s === "closed") && rating === null;

/** Tickets that have gone quiet: waiting on the person, or resolved, for longer than the limit. */
export function shouldAutoClose(s: Status, lastActivity: Date, now: Date = new Date(), ttlHours: number = idleCloseHours()): boolean {
  const hours = (now.getTime() - lastActivity.getTime()) / 3_600_000;
  return (s === "waiting_user" || s === "resolved") && hours >= ttlHours;
}
