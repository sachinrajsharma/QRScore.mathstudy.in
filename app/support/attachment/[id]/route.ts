import { NextResponse } from "next/server";
import { currentUser } from "@/lib/portal/guard";
import { attachmentFor } from "@/lib/support/store";
import { safeDownloadName } from "@/lib/support/attachments";

export const dynamic = "force-dynamic";

/** A ticket attachment. Only staff, the ticket's own account, or the holder of its private link (?t=token) get the file; anyone else sees the same 404 as a missing file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return new NextResponse("Not found", { status: 404 });
  const me = await currentUser();
  const token = new URL(req.url).searchParams.get("t");
  const file = await attachmentFor(id, { userId: me?.id ?? null, token, staff: me && me.role === "admin" ? { id: me.id, name: me.name, email: me.email } : null });
  if (!file) return new NextResponse("Not found", { status: 404 });
  const inline = file.mime.startsWith("image/") || new URL(req.url).searchParams.get("preview") === "1";
  return new NextResponse(new Uint8Array(file.bytes), { headers: {
    "Content-Type": file.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeDownloadName(file.name)}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
