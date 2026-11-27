import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { STAFF_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/support/model";
import { staffGet } from "@/lib/support/store";
import { when } from "@/components/support/ui";
import { PrintButton } from "@/components/support/print-button";
import { adminGate } from "../../../gate";

export const metadata: Metadata = { title: "Ticket print view | GrowQR admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A clean copy of a ticket for printing or saving as PDF from the browser: details, the whole conversation with internal notes marked, and the history. */
export default async function PrintTicket({ params }: { params: Promise<{ no: string }> }) {
  const no = (await params).no.toUpperCase();
  await adminGate(`/console/support/${no}`);
  const data = await staffGet(no, { markRead: false });
  if (!data) notFound();
  const { ticket: t, messages, events } = data;
  const rows: Array<[string, string]> = [
    ["Customer", `${t.userName} <${t.userEmail}>${t.phone ? ` ${t.phone}` : ""}`], ["Category", t.categoryName], ["Status", STAFF_STATUS_LABEL[t.status]], ["Priority", PRIORITY_LABEL[t.priority]],
    ["Reference", t.relatedRef || "none"], ["Opened", when(t.createdAt)], ["Assigned to", t.assignedName ?? "nobody"], ["Rating", t.rating ? `${t.rating}/5${t.ratingComment ? `: ${t.ratingComment}` : ""}` : "none"],
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-ink">
      <style>{"@media print { header, footer, nav, .no-print { display: none !important; } main { padding: 0 !important; } }"}</style>
      <div className="no-print mb-6"><PrintButton /></div>
      <h1 className="text-[22px] font-bold">{t.no}: {t.subject}</h1>
      <table className="mt-3 text-[14px]"><tbody>
        {rows.map(([k, v]) => <tr key={k}><th className="pr-4 text-left align-top font-semibold">{k}</th><td className="break-words">{v}</td></tr>)}
      </tbody></table>
      <h2 className="mt-6 text-[17px] font-semibold">Conversation</h2>
      <ol className="mt-2 space-y-3">
        {messages.map((m) => (
          <li key={m.id} className="break-inside-avoid rounded-lg border border-black/30 p-3 text-[14px]">
            <p className="text-[12.5px] text-ink-3"><b>{m.isInternal ? "Internal note" : m.isStaff ? `${m.authorName} (support)` : m.authorName}</b> · {when(m.createdAt)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
            {m.attachments.length ? <p className="mt-1 text-[12.5px] text-ink-3">Files: {m.attachments.map((a) => a.name).join(", ")}</p> : null}
          </li>
        ))}
      </ol>
      <h2 className="mt-6 text-[17px] font-semibold">History</h2>
      <ol className="mt-2 space-y-1 text-[13px]">{events.map((e, i) => <li key={i}>{when(e.createdAt)} · <b>{e.actor}</b> {e.kind}{e.detail ? `: ${e.detail}` : ""}</li>)}</ol>
    </main>
  );
}
