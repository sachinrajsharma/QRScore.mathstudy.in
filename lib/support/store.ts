import "server-only";
import { randomBytes } from "node:crypto";
import { all, one, run, val } from "../portal/db";
import { appUrl, send } from "../portal/mail";
import * as storage from "../market/storage";
import { LIMITS, PRIORITY_LABEL, STAFF_STATUS_LABEL, STATUS_LABEL, canRate, canUserReply, categoryLabel, defaultPriority, idleCloseHours, isAccessToken, isPriority, isStatus, isTicketNo, normaliseTicketNo, shouldAutoClose, statusAfterStaffReply, statusAfterUserReply, ticketNo, type NewTicket, type Priority, type Status } from "./model";
import { FREE_MAIL, SPAM_DROP, SPAM_QUARANTINE, emailDomain, spamScore } from "./antispam";
import { STORAGE_BUCKET, storedName, type FileCheck } from "./attachments";
import { toCsv } from "./csv";

/**
 * Support tickets on the portal database. A ticket belongs either to a signed-in account (user_id) or, for a guest, to nobody:
 * the guest reaches it only through a 48-character private link. Every query that serves a person filters by their user id or
 * that token. Staff (role admin) see and work every ticket from the admin console.
 */
export interface Attachment { id: number; messageId: number | null; name: string; mime: string; size: number }
export interface Ticket {
  id: number; no: string; userId: number | null; userName: string; userEmail: string; phone: string; token: string | null;
  category: string; categoryName: string; subject: string; relatedRef: string;
  status: Status; priority: Priority; assignedTo: number | null; assignedName: string | null;
  rating: number | null; ratingComment: string | null;
  isSpam: boolean; spamScore: number; ip: string | null; browser: string | null; mergedInto: string | null;
  createdAt: string; updatedAt: string; lastActivityAt: string; resolvedAt: string | null; closedAt: string | null;
  /** Unread messages for the person (their list) or for staff (the inbox). */
  unread: number;
}
export interface Message { id: number; authorName: string; isStaff: boolean; isInternal: boolean; body: string; createdAt: string; attachments: Attachment[] }
export interface SupportEvent { actor: string; kind: string; detail: string; createdAt: string }
export interface Actor { id: number; name: string; email: string }
/** A checked file ready to store. Build these with collectUploads (lib/support/uploads.ts). */
export interface Upload { name: string; mime: string; ext: Extract<FileCheck, { ok: true }>["ext"]; bytes: Uint8Array }
/** What the request layer knows about the sender: address, browser, the honeypot and the time trap. */
export interface Ctx { ip?: string; ua?: string; honeypot?: string; tooFast?: boolean; files?: Upload[] }

type Row = Record<string, unknown>;
const toDate = (s: string): Date => new Date(s.replace(" ", "T") + "Z");
const s = (v: unknown): string => String(v ?? "");

const SELECT = `SELECT t.*, u.name AS user_name, u.email AS user_email, a.name AS assigned_name, c.name AS category_name, m.ticket_no AS merged_no FROM support_tickets t
  LEFT JOIN users u ON u.id = t.user_id LEFT JOIN users a ON a.id = t.assigned_to
  LEFT JOIN support_categories c ON c.slug = t.category LEFT JOIN support_tickets m ON m.id = t.merged_into`;

function ticket(r: Row, unread = 0): Ticket {
  return {
    id: Number(r.id), no: s(r.ticket_no), userId: r.user_id === null || r.user_id === undefined ? null : Number(r.user_id),
    userName: s(r.name) || s(r.user_name), userEmail: s(r.email) || s(r.user_email), phone: s(r.phone), token: r.access_token ? s(r.access_token) : null,
    category: s(r.category), categoryName: s(r.category_name) || categoryLabel(s(r.category)), subject: s(r.subject), relatedRef: s(r.related_ref), status: (isStatus(r.status) ? r.status : "open"), priority: (isPriority(r.priority) ? r.priority : "medium"),
    assignedTo: r.assigned_to === null ? null : Number(r.assigned_to), assignedName: r.assigned_name === null || r.assigned_name === undefined ? null : s(r.assigned_name),
    rating: r.rating === null ? null : Number(r.rating), ratingComment: r.rating_comment === null ? null : s(r.rating_comment),
    isSpam: Number(r.is_spam) === 1, spamScore: Number(r.spam_score ?? 0), ip: r.ip ? s(r.ip) : null, browser: r.browser_info ? s(r.browser_info) : null, mergedInto: r.merged_no ? s(r.merged_no) : null,
    createdAt: s(r.created_at), updatedAt: s(r.updated_at), lastActivityAt: s(r.last_activity_at), resolvedAt: r.resolved_at ? s(r.resolved_at) : null, closedAt: r.closed_at ? s(r.closed_at) : null,
    unread,
  };
}

async function event(ticketId: number, actor: string, kind: string, detail = ""): Promise<void> {
  await run("INSERT INTO support_events (ticket_id, actor, kind, detail) VALUES ($1,$2,$3,$4)", [ticketId, actor.slice(0, 120), kind, detail.slice(0, 300)]);
}

const staffEmail = (): string => (process.env.SUPPORT_NOTIFY_EMAIL ?? "").trim();
const replyWithin = (): string => (process.env.SUPPORT_REPLY_WITHIN ?? "").trim() || "one working day";

/** Tell the team a ticket arrived or the person replied. Needs SUPPORT_NOTIFY_EMAIL; without it the admin console is where staff look. */
async function notifyStaff(t: { no: string; subject: string; id: number }, headline: string, detail: string): Promise<void> {
  const to = staffEmail();
  if (!to) return;
  try {
    await send({ email: to, name: "GrowQR support" }, `[${t.no}] ${headline}`, headline, [`Ticket ${t.no}: ${t.subject}`, detail], ["Open in the console", await appUrl(`/console/support/${t.no}`)], "support-staff");
  } catch (e) { console.error("[support] staff email failed:", (e as Error).message); }
}

/** The link in an email to the person: a guest gets the private link, a member the ticket in their account. */
async function ticketLink(t: Ticket): Promise<string> {
  return t.userId === null && t.token ? appUrl(`/support/ticket/${t.token}`) : appUrl(`/support/tickets/${t.no}`);
}

/** Email the person and write the outcome on the ticket timeline, so staff can see what was sent. */
async function notifyPerson(t: Ticket, subject: string, heading: string, paras: string[]): Promise<void> {
  if (!t.userEmail || t.isSpam) return;
  let outcome = "queued";
  try {
    await send({ email: t.userEmail, name: t.userName }, subject, heading, paras, ["Open your ticket", await ticketLink(t)], "support");
  } catch (e) { outcome = `failed: ${(e as Error).message.slice(0, 80)}`; }
  await event(t.id, "system", "email", `${heading} to ${t.userEmail}: ${outcome}`);
}

// ---- attachments -------------------------------------------------------------------------------------------------------------------------

async function saveFiles(ticketId: number, messageId: number | null, files: Upload[], by: "customer" | "staff"): Promise<void> {
  for (const f of files) {
    const stored = storedName(f.ext);
    if (!(await storage.put(STORAGE_BUCKET, `${ticketId}/${stored}`, f.bytes, f.mime))) throw new Error("Could not store an attachment.");
    await run("INSERT INTO support_attachments (ticket_id, message_id, orig_name, stored_name, mime, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [ticketId, messageId, f.name.slice(0, 255), stored, f.mime, f.bytes.byteLength, by]);
  }
}

async function attachmentsOf(ticketId: number): Promise<Map<number, Attachment[]>> {
  const rows = await all<Row>("SELECT id, message_id, orig_name, mime, size FROM support_attachments WHERE ticket_id = $1 ORDER BY id", [ticketId]);
  const by = new Map<number, Attachment[]>();
  for (const r of rows) {
    const k = r.message_id === null ? 0 : Number(r.message_id);
    (by.get(k) ?? by.set(k, []).get(k)!).push({ id: Number(r.id), messageId: k || null, name: s(r.orig_name), mime: s(r.mime), size: Number(r.size) });
  }
  return by;
}

export interface Download { name: string; mime: string; bytes: Buffer }
/** An attachment for download. Allowed for staff, the ticket's own account, or the holder of the ticket's private token; the download is logged. */
export async function attachmentFor(id: number, who: { userId?: number | null; token?: string | null; staff?: Actor | null }): Promise<Download | null> {
  const r = await one<Row>("SELECT a.*, t.user_id, t.access_token FROM support_attachments a JOIN support_tickets t ON t.id = a.ticket_id WHERE a.id = $1", [id]);
  if (!r) return null;
  const owner = who.userId !== undefined && who.userId !== null && Number(r.user_id) === who.userId;
  const holder = !!who.token && isAccessToken(who.token) && who.token === s(r.access_token);
  if (!who.staff && !owner && !holder) return null;
  const bytes = await storage.get(STORAGE_BUCKET, `${Number(r.ticket_id)}/${s(r.stored_name)}`);
  if (!bytes) return null;
  await event(Number(r.ticket_id), who.staff ? `staff:${who.staff.name}` : "customer", "download", s(r.orig_name));
  return { name: s(r.orig_name), mime: s(r.mime), bytes };
}

// ---- blocklist ---------------------------------------------------------------------------------------------------------------------------

export async function isBlocked(email: string, ip: string): Promise<boolean> {
  const e = email.toLowerCase();
  return (await one<Row>("SELECT id FROM support_blocklist WHERE (kind = 'email' AND value = $1) OR (kind = 'domain' AND value = $2) OR (kind = 'ip' AND value = $3) LIMIT 1", [e, emailDomain(e), ip])) !== null;
}

// ---- creating a ticket -------------------------------------------------------------------------------------------------------------------

/** `dropped`: the sender is blocked or scored as an obvious bot; nothing was stored, and they are shown a normal confirmation. */
export type CreateResult = { ok: true; no: string; duplicate: boolean; token: string | null; dropped?: boolean } | { ok: false; error: string };

/** The number shown to someone whose ticket was dropped: it looks real and points at nothing. */
const fakeNo = (): string => `SUP-${new Date().getUTCFullYear()}-${String(1000 + Math.floor(Math.random() * 9000)).padStart(6, "0")}`;

interface Who { userId: number | null; name: string; email: string; phone: string }

async function insertTicket(who: Who, input: NewTicket, ctx: Ctx): Promise<CreateResult> {
  const ip = (ctx.ip ?? "").slice(0, 64);
  const files = ctx.files ?? [];
  const cat = await one<Row>("SELECT slug, default_priority FROM support_categories WHERE slug = $1 AND is_active = 1", [input.category]);
  if (!cat) return { ok: false, error: "Choose what your ticket is about." };
  const priority: Priority = isPriority(cat.default_priority) ? cat.default_priority : defaultPriority(input.category);

  const recent = who.userId !== null
    ? Number(await val<number>("SELECT COUNT(*) FROM support_tickets WHERE user_id = $1 AND created_at > (NOW() - INTERVAL 1 HOUR)", [who.userId]) ?? 0)
    : Number(await val<number>("SELECT COUNT(*) FROM support_tickets WHERE email = $1 AND created_at > (NOW() - INTERVAL 1 HOUR)", [who.email]) ?? 0);
  if (recent >= LIMITS.perHour) return { ok: false, error: `You have opened ${LIMITS.perHour} tickets in the last hour. Please wait a little, or add to a ticket you already have.` };
  if (ip) {
    const fromIp = Number(await val<number>("SELECT COUNT(*) FROM support_tickets WHERE ip = $1 AND created_at > (NOW() - INTERVAL 1 HOUR)", [ip]) ?? 0);
    if (fromIp >= LIMITS.perIpPerHour) return { ok: false, error: "Too many tickets have been sent from your network in the last hour. Please wait a while and try again." };
  }
  if (who.userId !== null) {
    const open = Number(await val<number>("SELECT COUNT(*) FROM support_tickets WHERE user_id = $1 AND status NOT IN ('resolved','closed')", [who.userId]) ?? 0);
    if (open >= LIMITS.openAtOnce) return { ok: false, error: `You already have ${open} open tickets. Please wait for replies, or reply on one of them, before opening more.` };
  }

  // The same person sending the same subject within a day is a double click or a retry, not a new problem.
  const dup = who.userId !== null
    ? await one<Row>("SELECT * FROM support_tickets WHERE user_id = $1 AND LOWER(subject) = LOWER($2) AND created_at > (NOW() - INTERVAL 1 DAY) ORDER BY id DESC LIMIT 1", [who.userId, input.subject])
    : await one<Row>("SELECT * FROM support_tickets WHERE email = $1 AND LOWER(subject) = LOWER($2) AND created_at > (NOW() - INTERVAL 1 DAY) ORDER BY id DESC LIMIT 1", [who.email, input.subject]);
  if (dup) {
    // A guest is never handed the existing ticket's token here (anyone could type someone else's email and subject): the link is emailed to the address on the ticket instead.
    if (who.userId === null) { const t = await one<Row>(`${SELECT} WHERE t.id = $1`, [Number(dup.id)]); if (t) await notifyPerson(ticket(t), `[${s(dup.ticket_no)}] Your ticket is already open`, "Your ticket is already open", [`You already sent this request: ${s(dup.ticket_no)}. You can follow it from the link below.`]); }
    return { ok: true, no: s(dup.ticket_no), duplicate: true, token: null };
  }

  // Known spammers and obvious bots get a normal-looking confirmation and nothing is stored or emailed, so they cannot learn what tripped them.
  if (await isBlocked(who.email, ip)) return { ok: true, no: fakeNo(), duplicate: false, token: null, dropped: true };
  const score = spamScore({ honeypot: ctx.honeypot, description: input.body, subject: input.subject, name: who.name, email: who.email, tooFast: !!ctx.tooFast });
  if (score >= SPAM_DROP) return { ok: true, no: fakeNo(), duplicate: false, token: null, dropped: true };
  const isSpam = score >= SPAM_QUARANTINE ? 1 : 0;

  const token = randomBytes(24).toString("hex");
  const id = Number(await val<number>("INSERT INTO support_tickets (user_id, name, email, phone, category, subject, related_ref, status, priority, access_token, browser_info, ip, spam_score, is_spam) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13) RETURNING id",
    [who.userId, who.name, who.email, who.phone || null, input.category, input.subject, input.related_ref, priority, token, (ctx.ua ?? "").slice(0, 400) || null, ip || null, score, isSpam]));
  const no = ticketNo(id);
  await run("UPDATE support_tickets SET ticket_no = $1 WHERE id = $2", [no, id]);
  const messageId = Number(await val<number>("INSERT INTO support_messages (ticket_id, author_id, is_staff, is_internal, body, read_by_user, read_by_staff) VALUES ($1,$2,0,0,$3,1,0) RETURNING id", [id, who.userId, input.body]));
  try { await saveFiles(id, messageId, files, "customer"); } catch (e) { await run("DELETE FROM support_tickets WHERE id = $1", [id]); return { ok: false, error: (e as Error).message }; }
  await event(id, who.name, "created", `${cat.slug}, ${PRIORITY_LABEL[priority]} priority${score ? `, spam_score=${score}` : ""}${files.length ? `, ${files.length} file(s)` : ""}`);
  if (!isSpam) {
    const t = ticket((await one<Row>(`${SELECT} WHERE t.id = $1`, [id]))!);
    await notifyPerson(t, `[${no}] We received your support request`, "We received your request", [`Your ticket ${no} is open: ${input.subject}.`, `The GrowQR team replies within ${replyWithin()}. You will get an email when we do, and you can reply and add files on the ticket page at any time.`]);
    await notifyStaff(t, "New support ticket", `${who.name} (${who.email}) opened a ${PRIORITY_LABEL[priority]} priority ticket in "${cat.slug}".`);
  }
  return { ok: true, no, duplicate: false, token };
}

/** A ticket from a signed-in member. */
export async function createTicket(user: Actor, input: NewTicket, ctx: Ctx = {}): Promise<CreateResult> {
  return insertTicket({ userId: user.id, name: user.name, email: user.email, phone: "" }, input, ctx);
}

/** A ticket from a guest: the private link is the only way back to it. */
export async function createGuestTicket(input: NewTicket & { name: string; email: string; phone: string }, ctx: Ctx = {}): Promise<CreateResult> {
  return insertTicket({ userId: null, name: input.name, email: input.email, phone: input.phone }, input, ctx);
}

// ---- a person's own tickets --------------------------------------------------------------------------------------------------------------

export async function listForUser(userId: number, q = ""): Promise<Ticket[]> {
  const params: unknown[] = [userId];
  let where = "t.user_id = $1 AND t.is_spam = 0";
  if (q) { where += " AND (t.ticket_no LIKE $2 OR t.subject LIKE $2 OR t.related_ref LIKE $2)"; params.push(`%${q.slice(0, 80)}%`); }
  const rows = await all<Row>(`${SELECT} WHERE ${where} ORDER BY t.updated_at DESC LIMIT 100`, params);
  const unread = new Map((await all<Row>("SELECT ticket_id, COUNT(*) AS n FROM support_messages WHERE is_staff = 1 AND is_internal = 0 AND read_by_user = 0 AND ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1) GROUP BY ticket_id", [userId])).map((r) => [Number(r.ticket_id), Number(r.n)]));
  return rows.map((r) => ticket(r, unread.get(Number(r.id)) ?? 0));
}

export async function unreadFor(userId: number): Promise<number> {
  return Number(await val<number>("SELECT COUNT(*) FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE t.user_id = $1 AND m.is_staff = 1 AND m.is_internal = 0 AND m.read_by_user = 0", [userId]) ?? 0);
}

async function mine(userId: number, no: string): Promise<Ticket | null> {
  if (!isTicketNo(no)) return null;
  const r = await one<Row>(`${SELECT} WHERE t.ticket_no = $1 AND t.user_id = $2`, [no, userId]);
  return r ? ticket(r) : null;
}

async function byToken(token: string): Promise<Ticket | null> {
  if (!isAccessToken(token)) return null;
  const r = await one<Row>(`${SELECT} WHERE t.access_token = $1`, [token]);
  return r ? ticket(r) : null;
}

async function viewFor(t: Ticket): Promise<{ ticket: Ticket; messages: Message[] }> {
  await run("UPDATE support_messages SET read_by_user = 1 WHERE ticket_id = $1 AND is_staff = 1 AND is_internal = 0", [t.id]);
  return { ticket: t, messages: await messagesOf(t, false) };
}

/** A person's own ticket with its public conversation (internal notes are never returned). Opening it marks the team's replies as read. */
export async function getForUser(userId: number, no: string): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  const t = await mine(userId, no);
  return t ? viewFor(t) : null;
}

/** A ticket reached through its private link (how guests get back to it). */
export async function getByToken(token: string): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  const t = await byToken(token);
  return t ? viewFor(t) : null;
}

async function messagesOf(t: Ticket, withInternal: boolean): Promise<Message[]> {
  const rows = await all<Row>(`SELECT m.*, u.name AS author_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.ticket_id = $1 ${withInternal ? "" : "AND m.is_internal = 0"} ORDER BY m.created_at, m.id`, [t.id]);
  const atts = await attachmentsOf(t.id);
  return rows.map((r) => {
    const staff = Number(r.is_staff) === 1;
    return { id: Number(r.id), authorName: staff ? (s(r.author_name) || "GrowQR support") : (s(r.author_name) || t.userName), isStaff: staff, isInternal: Number(r.is_internal) === 1, body: s(r.body), createdAt: s(r.created_at), attachments: atts.get(Number(r.id)) ?? [] };
  });
}

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });

async function customerReply(t: Ticket, authorId: number | null, actorName: string, body: string, files: Upload[]): Promise<ActionResult> {
  if (!canUserReply(t.status)) return fail("This ticket is closed. Please open a new ticket if you still need help.");
  const recent = authorId === null
    ? Number(await val<number>("SELECT COUNT(*) FROM support_messages WHERE ticket_id = $1 AND is_staff = 0 AND created_at > (NOW() - INTERVAL 1 HOUR)", [t.id]) ?? 0)
    : Number(await val<number>("SELECT COUNT(*) FROM support_messages WHERE author_id = $1 AND is_staff = 0 AND created_at > (NOW() - INTERVAL 1 HOUR)", [authorId]) ?? 0);
  if (recent >= LIMITS.repliesPerHour) return fail("You have sent a lot of messages in the last hour. Please wait a little.");
  const mid = Number(await val<number>("INSERT INTO support_messages (ticket_id, author_id, is_staff, is_internal, body, read_by_user, read_by_staff) VALUES ($1,$2,0,0,$3,1,0) RETURNING id", [t.id, authorId, body]));
  try { await saveFiles(t.id, mid, files, "customer"); } catch (e) { await run("DELETE FROM support_messages WHERE id = $1", [mid]); return fail((e as Error).message); }
  const next = statusAfterUserReply(t.status);
  await run("UPDATE support_tickets SET last_activity_at = NOW(), status = $1, resolved_at = CASE WHEN $1 = 'open' THEN NULL ELSE resolved_at END WHERE id = $2", [next ?? t.status, t.id]);
  await event(t.id, actorName, "reply", (next && next !== t.status ? `replied; reopened from ${t.status}` : "replied") + (files.length ? ` (+${files.length} file)` : ""));
  if (!t.isSpam) await notifyStaff(t, "Customer replied", `${actorName} replied on this ticket.`);
  return { ok: true };
}

export async function replyAsUser(user: Actor, no: string, body: string, files: Upload[] = []): Promise<ActionResult> {
  const t = await mine(user.id, no);
  return t ? customerReply(t, user.id, user.name, body, files) : fail("That ticket was not found.");
}

/** A reply from the holder of the ticket's private link. */
export async function replyByToken(token: string, body: string, files: Upload[] = []): Promise<ActionResult> {
  const t = await byToken(token);
  return t ? customerReply(t, t.userId, t.userName, body, files) : fail("That ticket link is not valid.");
}

async function rateTicket(t: Ticket | null, actor: string, rating: number, comment: string): Promise<ActionResult> {
  if (!t || !canRate(t.status, t.rating)) return fail("This ticket cannot be rated.");
  await run("UPDATE support_tickets SET rating = $1, rating_comment = $2 WHERE id = $3", [rating, comment || null, t.id]);
  await event(t.id, actor, "rating", `${rating}/5`);
  return { ok: true };
}
export async function rate(user: Actor, no: string, rating: number, comment: string): Promise<ActionResult> {
  return rateTicket(await mine(user.id, no), user.name, rating, comment);
}
export async function rateByToken(token: string, rating: number, comment: string): Promise<ActionResult> {
  const t = await byToken(token);
  return rateTicket(t, t?.userName ?? "customer", rating, comment);
}

// ---- staff ---------------------------------------------------------------------------------------------------------------------------------

export interface Filters { status?: string; priority?: string; category?: string; q?: string; assigned?: "me" | "none"; page?: number; spam?: boolean }
export interface Stats { total: number; open: number; pending: number; waiting: number; resolved: number; closed: number; critical: number; today: number; avgRating: number | null; avgResolutionHours: number | null; spam: number }

export async function staffList(f: Filters, staffId: number): Promise<{ tickets: Ticket[]; total: number; pages: number; stats: Stats }> {
  const where: string[] = [f.spam ? "t.is_spam = 1" : "t.is_spam = 0"];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace("?", `$${p.length}`)); };
  if (isStatus(f.status)) add("t.status = ?", f.status);
  if (isPriority(f.priority)) add("t.priority = ?", f.priority);
  if (f.category) add("t.category = ?", f.category.slice(0, 30));
  if (f.assigned === "me") add("t.assigned_to = ?", staffId);
  if (f.assigned === "none") where.push("t.assigned_to IS NULL");
  if (f.q) { p.push(`%${f.q.slice(0, 80)}%`); const i = p.length; where.push(`(t.ticket_no LIKE $${i} OR t.subject LIKE $${i} OR t.email LIKE $${i} OR t.name LIKE $${i} OR t.related_ref LIKE $${i} OR u.email LIKE $${i} OR u.name LIKE $${i})`); }
  const page = Math.max(1, Math.trunc(f.page ?? 1));
  const per = 40;
  const total = Number(await val<number>(`SELECT COUNT(*) FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE ${where.join(" AND ")}`, p) ?? 0);
  const rows = await all<Row>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY FIELD(t.status,'open','pending','waiting_user','resolved','closed'), FIELD(t.priority,'critical','high','medium','low'), t.last_activity_at DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, p);
  const unread = new Map((await all<Row>("SELECT ticket_id, COUNT(*) AS n FROM support_messages WHERE is_staff = 0 AND read_by_staff = 0 GROUP BY ticket_id")).map((r) => [Number(r.ticket_id), Number(r.n)]));
  const st = (await one<Row>(`SELECT COUNT(*) AS total, SUM(status='open') AS open_n, SUM(status='pending') AS pending_n, SUM(status='waiting_user') AS waiting_n,
      SUM(status='resolved') AS resolved_n, SUM(status='closed') AS closed_n, SUM(priority='critical' AND status NOT IN ('resolved','closed')) AS critical_n,
      SUM(DATE(created_at) = CURDATE()) AS today_n, ROUND(AVG(rating), 2) AS avg_rating,
      ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, resolved_at) END) / 60, 1) AS avg_res_hours FROM support_tickets WHERE is_spam = 0`)) ?? {};
  const spam = Number(await val<number>("SELECT COUNT(*) FROM support_tickets WHERE is_spam = 1") ?? 0);
  const n = (k: string): number => Number(st[k] ?? 0);
  const opt = (k: string): number | null => (st[k] === null || st[k] === undefined ? null : Number(st[k]));
  return { tickets: rows.map((r) => ticket(r, unread.get(Number(r.id)) ?? 0)), total, pages: Math.max(1, Math.ceil(total / per)), stats: { total: n("total"), open: n("open_n"), pending: n("pending_n"), waiting: n("waiting_n"), resolved: n("resolved_n"), closed: n("closed_n"), critical: n("critical_n"), today: n("today_n"), avgRating: opt("avg_rating"), avgResolutionHours: opt("avg_res_hours"), spam } };
}

export interface StaffView { ticket: Ticket; messages: Message[]; events: SupportEvent[]; history: Array<{ no: string; subject: string; status: Status; createdAt: string }>; staff: Array<{ id: number; name: string }>; templates: Array<{ id: number; title: string; body: string; active: boolean }> }

export async function staffGet(no: string, opts: { markRead?: boolean } = {}): Promise<StaffView | null> {
  if (!isTicketNo(no)) return null;
  const r = await one<Row>(`${SELECT} WHERE t.ticket_no = $1`, [no]);
  if (!r) return null;
  const t = ticket(r);
  if (opts.markRead !== false) await run("UPDATE support_messages SET read_by_staff = 1 WHERE ticket_id = $1", [t.id]);
  const events = (await all<Row>("SELECT * FROM support_events WHERE ticket_id = $1 ORDER BY created_at, id", [t.id])).map((e) => ({ actor: s(e.actor), kind: s(e.kind), detail: s(e.detail), createdAt: s(e.created_at) }));
  const history = (await all<Row>("SELECT ticket_no, subject, status, created_at FROM support_tickets WHERE ((user_id IS NOT NULL AND user_id = $1) OR email = $2) AND id <> $3 AND is_spam = 0 ORDER BY id DESC LIMIT 10", [t.userId, t.userEmail, t.id])).map((h) => ({ no: s(h.ticket_no), subject: s(h.subject), status: (isStatus(h.status) ? h.status : "open") as Status, createdAt: s(h.created_at) }));
  const staff = (await all<Row>("SELECT id, name FROM users WHERE role = 'admin' ORDER BY name")).map((u) => ({ id: Number(u.id), name: s(u.name) }));
  return { ticket: t, messages: await messagesOf(t, true), events, history, staff, templates: await listTemplates(true) };
}

async function byNo(no: string): Promise<Ticket | null> {
  if (!isTicketNo(no)) return null;
  const r = await one<Row>(`${SELECT} WHERE t.ticket_no = $1`, [no]);
  return r ? ticket(r) : null;
}

export async function staffReply(staff: Actor, no: string, body: string, internal: boolean, newStatus?: string, files: Upload[] = []): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t) return fail("That ticket was not found.");
  const mid = Number(await val<number>("INSERT INTO support_messages (ticket_id, author_id, is_staff, is_internal, body, read_by_user, read_by_staff) VALUES ($1,$2,1,$3,$4,$5,1) RETURNING id", [t.id, staff.id, internal ? 1 : 0, body, internal ? 1 : 0]));
  try { await saveFiles(t.id, mid, files, "staff"); } catch (e) { await run("DELETE FROM support_messages WHERE id = $1", [mid]); return fail((e as Error).message); }
  await event(t.id, `staff:${staff.name}`, internal ? "note" : "reply", (internal ? "internal note" : "replied") + (files.length ? ` (+${files.length} file)` : ""));
  let status: Status = t.status;
  if (!internal) status = isStatus(newStatus) && newStatus !== t.status ? newStatus : t.status === "closed" ? t.status : statusAfterStaffReply(t.status);
  await run("UPDATE support_tickets SET last_activity_at = NOW() WHERE id = $1", [t.id]);
  if (status !== t.status) await applyStatus(t, status, staff);
  if (!internal) {
    const fresh = (await byNo(no)) ?? t;
    await notifyPerson(fresh, `[${no}] New reply from GrowQR support`, "We replied to your ticket", [`Ticket ${no}: ${t.subject}`, body.length > 600 ? body.slice(0, 600) + "..." : body]);
  }
  return { ok: true };
}

async function applyStatus(t: Ticket, status: Status, staff: Actor | null): Promise<void> {
  await run("UPDATE support_tickets SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() WHEN $1 = 'open' THEN NULL ELSE resolved_at END, closed_at = CASE WHEN $1 = 'closed' THEN NOW() WHEN $1 = 'open' THEN NULL ELSE closed_at END WHERE id = $2", [status, t.id]);
  await event(t.id, staff ? `staff:${staff.name}` : "system", t.status === "closed" && status === "open" ? "reopen" : "status", `${t.status} to ${status}`);
}

export async function staffSetStatus(staff: Actor, no: string, status: string): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t || !isStatus(status)) return fail("That ticket or status was not found.");
  if (status === t.status) return { ok: true };
  await applyStatus(t, status, staff);
  if (status === "resolved" || status === "closed") {
    await notifyPerson({ ...t, status }, `[${no}] Your ticket is ${STATUS_LABEL[status].toLowerCase()}`, `Your ticket is ${STATUS_LABEL[status].toLowerCase()}`, [status === "resolved" ? "We believe this is sorted. If anything is still wrong, reply on the ticket and it will reopen." : "This ticket is now closed. You can rate our help on the ticket page, or open a new ticket if you need more help."]);
  }
  return { ok: true };
}

export async function staffSetPriority(staff: Actor, no: string, priority: string): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t || !isPriority(priority)) return fail("That ticket or priority was not found.");
  await run("UPDATE support_tickets SET priority = $1 WHERE id = $2", [priority, t.id]);
  await event(t.id, `staff:${staff.name}`, "priority", `${t.priority} to ${priority}`);
  return { ok: true };
}

export async function staffAssign(staff: Actor, no: string, staffId: number | null): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t) return fail("That ticket was not found.");
  let name = "nobody";
  if (staffId !== null) {
    const u = await one<Row>("SELECT id, name FROM users WHERE id = $1 AND role = 'admin'", [staffId]);
    if (!u) return fail("Only administrators can be assigned.");
    name = s(u.name);
  }
  await run("UPDATE support_tickets SET assigned_to = $1 WHERE id = $2", [staffId, t.id]);
  await event(t.id, `staff:${staff.name}`, "assign", `assigned to ${name}`);
  return { ok: true };
}

/** Close a duplicate into another ticket: it is closed and points at the ticket that carries on. Returns the surviving ticket's number. */
export async function staffMerge(staff: Actor, no: string, targetNoRaw: string): Promise<{ ok: true; target: string } | { ok: false; error: string }> {
  const t = await byNo(no);
  const targetNo = normaliseTicketNo(targetNoRaw);
  const target = isTicketNo(targetNo) && targetNo !== no ? await byNo(targetNo) : null;
  if (!t || !target) return { ok: false, error: "Type the number of another existing ticket to merge into." };
  if (target.mergedInto !== null) return { ok: false, error: `${targetNo} was itself merged into ${target.mergedInto}. Merge into that one.` };
  await run("UPDATE support_tickets SET merged_into = $1, status = 'closed', closed_at = NOW() WHERE id = $2", [target.id, t.id]);
  await event(t.id, `staff:${staff.name}`, "merge", `merged into ${target.no}`);
  await event(target.id, `staff:${staff.name}`, "merge", `absorbed ${t.no}`);
  return { ok: true, target: target.no };
}

export async function staffToggleSpam(staff: Actor, no: string): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t) return fail("That ticket was not found.");
  await run("UPDATE support_tickets SET is_spam = $1 WHERE id = $2", [t.isSpam ? 0 : 1, t.id]);
  await event(t.id, `staff:${staff.name}`, "spam", t.isSpam ? "unmarked as spam" : "marked as spam");
  return { ok: true };
}

/** Mark spam and block the sender: the exact email, its domain (unless a free mail provider, where the domain is shared by innocent people) and the IP. Every other ticket from that email goes to the spam folder too. */
export async function staffSpamBlock(staff: Actor, no: string): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t) return fail("That ticket was not found.");
  const actor = `staff:${staff.name}`;
  const email = t.userEmail.toLowerCase(), dom = emailDomain(email);
  const reason = `Spam ticket ${t.no}`.slice(0, 255);
  const add = async (kind: string, value: string | null) => { if (value) await run("INSERT IGNORE INTO support_blocklist (kind, value, reason, created_by) VALUES ($1,$2,$3,$4)", [kind, value, reason, actor]); };
  const domain = dom && !FREE_MAIL.has(dom) ? dom : null;
  await add("email", email); await add("domain", domain); await add("ip", t.ip);
  await run("UPDATE support_tickets SET is_spam = 1 WHERE email = $1", [email]);
  await event(t.id, actor, "spam", "marked spam and blocked " + [email, domain, t.ip].filter(Boolean).join(", "));
  return { ok: true };
}

export async function listBlocklist(): Promise<Array<{ id: number; kind: string; value: string; reason: string; createdBy: string; createdAt: string }>> {
  return (await all<Row>("SELECT * FROM support_blocklist ORDER BY id DESC LIMIT 100")).map((r) => ({ id: Number(r.id), kind: s(r.kind), value: s(r.value), reason: s(r.reason), createdBy: s(r.created_by), createdAt: s(r.created_at) }));
}
export async function unblock(id: number): Promise<void> { await run("DELETE FROM support_blocklist WHERE id = $1", [id]); }

/** Delete a ticket for good: its attachment files first, then the row (messages, attachment rows and events cascade). */
export async function staffDelete(staff: Actor, no: string): Promise<ActionResult> {
  const t = await byNo(no);
  if (!t) return fail("That ticket was not found.");
  for (const a of await all<Row>("SELECT stored_name FROM support_attachments WHERE ticket_id = $1", [t.id])) await storage.remove(STORAGE_BUCKET, `${t.id}/${s(a.stored_name)}`);
  await run("UPDATE support_tickets SET merged_into = NULL WHERE merged_into = $1", [t.id]);
  await run("DELETE FROM support_tickets WHERE id = $1", [t.id]);
  console.log(`[support] ticket ${t.no} deleted by ${staff.name}`);
  return { ok: true };
}

// ---- settings: categories and reply templates --------------------------------------------------------------------------------------------

export interface CategoryRow { id: number; slug: string; name: string; defaultPriority: Priority; active: boolean }
export async function listCategories(activeOnly = false): Promise<CategoryRow[]> {
  return (await all<Row>(`SELECT * FROM support_categories ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY sort_order, name`)).map((r) => ({ id: Number(r.id), slug: s(r.slug), name: s(r.name), defaultPriority: isPriority(r.default_priority) ? r.default_priority : "medium", active: Number(r.is_active) === 1 }));
}
export async function addCategory(name: string, priority: string): Promise<ActionResult> {
  const clean = name.trim().slice(0, 80);
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  if (clean.length < 2 || !slug) return fail("Give the category a name of at least 2 characters.");
  await run("INSERT IGNORE INTO support_categories (slug, name, default_priority, sort_order) VALUES ($1,$2,$3,50)", [slug, clean, isPriority(priority) ? priority : "medium"]);
  return { ok: true };
}
export async function toggleCategory(id: number): Promise<void> { await run("UPDATE support_categories SET is_active = 1 - is_active WHERE id = $1", [id]); }

export async function listTemplates(activeOnly = false): Promise<Array<{ id: number; title: string; body: string; active: boolean }>> {
  return (await all<Row>(`SELECT * FROM support_templates ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY is_active DESC, id`)).map((r) => ({ id: Number(r.id), title: s(r.title), body: s(r.body), active: Number(r.is_active) === 1 }));
}
export async function addTemplate(title: string, body: string): Promise<ActionResult> {
  const t = title.trim().slice(0, 120), b = body.trim().slice(0, 8000);
  if (t.length < 2 || b.length < 5) return fail("A template needs a title and some text.");
  await run("INSERT IGNORE INTO support_templates (title, body) VALUES ($1,$2)", [t, b]);
  return { ok: true };
}
export async function toggleTemplate(id: number): Promise<void> { await run("UPDATE support_templates SET is_active = 1 - is_active WHERE id = $1", [id]); }

// ---- export ----------------------------------------------------------------------------------------------------------------------------------

const CSV_COLS = ["ticket_no", "created_at", "name", "email", "phone", "category", "subject", "status", "priority", "related_ref", "rating", "resolved_at", "closed_at"];
/** The ticket list as CSV (spam excluded, newest first, at most 5,000 rows). */
export async function exportCsv(): Promise<string> {
  const rows = await all<Row>(`SELECT t.ticket_no, t.created_at, COALESCE(NULLIF(t.name, ''), u.name) AS name, COALESCE(NULLIF(t.email, ''), u.email) AS email, t.phone, COALESCE(c.name, t.category) AS category, t.subject, t.status, t.priority, t.related_ref, t.rating, t.resolved_at, t.closed_at
    FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN support_categories c ON c.slug = t.category WHERE t.is_spam = 0 ORDER BY t.id DESC LIMIT 5000`);
  return toCsv(CSV_COLS, rows);
}

// ---- housekeeping ----------------------------------------------------------------------------------------------------------------------------

/** Close tickets that have gone quiet (waiting on the person, or resolved, for SUPPORT_TICKET_TTL_HOURS; default a week), with a note on the ticket. Safe to repeat. */
export async function autoCloseIdle(now: Date = new Date()): Promise<number> {
  const ttl = idleCloseHours();
  const rows = await all<Row>("SELECT id, status, last_activity_at FROM support_tickets WHERE is_spam = 0 AND status IN ('waiting_user','resolved') AND last_activity_at < (NOW() - INTERVAL $1 HOUR)", [Math.max(1, ttl - 1)]);
  const span = ttl % 24 === 0 ? `${ttl / 24} day${ttl === 24 ? "" : "s"}` : `${ttl} hours`;
  let n = 0;
  for (const r of rows) {
    if (!isStatus(r.status) || !shouldAutoClose(r.status, toDate(s(r.last_activity_at)), now, ttl)) continue;
    const t = await one<Row>(`${SELECT} WHERE t.id = $1`, [Number(r.id)]);
    if (!t) continue;
    const tk = ticket(t);
    await run("INSERT INTO support_messages (ticket_id, author_id, is_staff, is_internal, body, read_by_user, read_by_staff) VALUES ($1,NULL,1,0,$2,0,1)", [tk.id, `This ticket was closed automatically after ${span} without activity. If you still need help, please open a new ticket and we will pick it up from there.`]);
    await applyStatus(tk, "closed", null);
    n++;
  }
  return n;
}

export { STAFF_STATUS_LABEL };
