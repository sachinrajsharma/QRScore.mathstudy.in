import { getSession } from "@/lib/portal/session";

/**
 * The one-time message an action leaves behind. Next renders a Server Action's redirect target once for the action response and again for the
 * browser, so a message that is deleted on first read never reaches the screen. This one carries a timestamp, is never deleted on read, and is
 * simply ignored after 30 seconds.
 */
export const FLASH_KEY = "jflash";
export const flashValue = (kind: "ok" | "err", text: string): Record<string, unknown> => ({ [FLASH_KEY]: [kind, text, Date.now()] });

export async function JourneyFlash() {
  const f = (await getSession())?.data?.[FLASH_KEY] as [string, string, number] | undefined;
  if (!f || Date.now() - Number(f[2]) > 30_000) return null;
  return f[0] === "ok"
    ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[14px] text-emerald-900">{f[1]}</p>
    : <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[14px] text-red-800">{f[1]}</p>;
}
