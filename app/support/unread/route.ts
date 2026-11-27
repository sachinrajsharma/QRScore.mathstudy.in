import { NextResponse } from "next/server";
import { currentUser } from "@/lib/portal/guard";
import { unreadFor } from "@/lib/support/store";

export const dynamic = "force-dynamic";

/** How many replies from the team a signed-in member has not read yet (for a header badge). */
export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ unread: 0 }, { status: 401 });
  return NextResponse.json({ unread: await unreadFor(me.id).catch(() => 0) }, { headers: { "Cache-Control": "private, no-store" } });
}
