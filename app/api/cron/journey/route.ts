export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { flushMail } from "@/lib/portal/mail";
import { runSweep } from "@/lib/journey/notify";

/**
 * GET /api/cron/journey: the reminder, overdue-alert and escalation sweep for overseas journeys. Run it once a day (or more often) from the host's
 * scheduler with `Authorization: Bearer <CRON_SECRET>`. It fails closed when CRON_SECRET is unset. Safe to call repeatedly: every notification is
 * de-duplicated, so a second call creates nothing new. Then it sends any queued email.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });
  const report = await runSweep();
  await flushMail().catch(() => undefined);
  return NextResponse.json({ status: "ok", report });
}
