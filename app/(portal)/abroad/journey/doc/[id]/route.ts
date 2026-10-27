import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/portal/guard";
import * as DC from "@/lib/journey/docs";

export const dynamic = "force-dynamic";

/** Serves a journey document only to a signed-in person it was issued to, through a short-lived signed link. Never cached, never indexable. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  const id = parseInt((await ctx.params).id, 10) || 0;
  const exp = parseInt(req.nextUrl.searchParams.get("exp") ?? "", 10) || 0;
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const deny = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!me || !id || !(await DC.validLink(id, me.id, exp, sig))) return deny();
  if (me.role !== "student" && me.role !== "counselor" && me.role !== "admin") return deny();
  const f = await DC.openFile(id, { id: me.id, role: me.role });
  if (!f) return deny();
  const safe = f.name.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${safe}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
