import { NextResponse } from "next/server";
import { adminGate } from "../../gate";
import { exportCsv } from "@/lib/support/store";

export const dynamic = "force-dynamic";

/** The ticket list as a CSV file for staff (spam excluded). */
export async function GET() {
  await adminGate("/console/support");
  return new NextResponse(await exportCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="support-tickets.csv"', "Cache-Control": "private, no-store" } });
}
