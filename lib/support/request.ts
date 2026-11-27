import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/lib/portal/security";
import { honeypotHit, tooFast } from "./antispam";
import { collectUploads } from "./uploads";
import type { Ctx } from "./store";

/** What the request layer adds to a ticket: the sender's address and browser, the hidden honeypot, the time trap, and the checked attachments. */
export async function requestCtx(fd: FormData): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: string }> {
  const up = await collectUploads(fd);
  if (!up.ok) return up;
  let ua = "";
  try { ua = (await headers()).get("user-agent") ?? ""; } catch { /* outside a request */ }
  return { ok: true, ctx: { ip: await clientIp(), ua, honeypot: honeypotHit(fd.get("website")) ? String(fd.get("website")) : "", tooFast: tooFast(fd.get("form_ts")), files: up.files } };
}

export const text = (fd: FormData, k: string): string => (typeof fd.get(k) === "string" ? String(fd.get(k)) : "");
