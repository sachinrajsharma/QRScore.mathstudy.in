import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/portal/guard";
import * as ST from "@/lib/journey/store";
import * as WS from "@/lib/journey/workspace";

export const dynamic = "force-dynamic";

/** CSV of the cases the signed-in staff member may see (assigned cases for a counselor, all for an administrator). Progress and contact data only; never documents. */
export async function GET(req: NextRequest) {
  const me = await currentUser();
  if (!me || (me.role !== "counselor" && me.role !== "admin")) return new NextResponse("Not found", { status: 404 });
  if (me.is_demo) return new NextResponse("Exports are switched off in the demo.", { status: 403 });
  const q = req.nextUrl.searchParams;
  const who = { id: me.id, role: me.role };
  const rows = await WS.caseload(who, { country: q.get("country") ?? undefined, university: q.get("university") ?? undefined, intake: q.get("intake") ?? undefined, status: q.get("status") ?? undefined, urgency: (q.get("urgency") as WS.Filters["urgency"]) || undefined, q: q.get("q") ?? undefined, consultant: q.get("consultant") === "none" ? "none" : q.get("consultant") ? Number(q.get("consultant")) : undefined }, 2000);
  for (const r of rows.slice(0, 1)) await ST.logEvent({ caseId: r.caseId, actorId: me.id, actorRole: me.role, kind: "export", note: `CSV export of ${rows.length} case(s)` });
  return new NextResponse(WS.toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="journey-cases-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
