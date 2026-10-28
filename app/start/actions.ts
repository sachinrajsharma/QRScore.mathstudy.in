"use server";

import { redirect } from "next/navigation";
import { extractFile, ExtractError } from "@/lib/qrscore/extract";
import { gateMessage, isScored, scoreExtraction } from "@/lib/qrscore";
import { summarize, GUEST_KEY } from "@/lib/qrscore/guest";
import { clientIp, fails, recordFail } from "@/lib/portal/security";
import { databaseConfigured } from "@/lib/portal/db";
import { getSession, putSessionData } from "@/lib/portal/session";

/**
 * The home page's resume box. Anyone can drop a resume and see their QR Score without an account. The file is read, scored and thrown away: only the
 * extracted text and the result are kept, in the visitor's own anonymous session for a day, so that creating an account afterwards can save it.
 */
export interface ScanState { error?: string }

const MAX_BYTES = 5 * 1024 * 1024;
const PER_HOUR = 12;

export async function scanResumeAction(_prev: ScanState, fd: FormData): Promise<ScanState> {
  if (!databaseConfigured()) return { error: "The resume scan is not available on this site yet." };
  if (String(fd.get("website") ?? "").trim() !== "") return { error: "We could not read that file. Please try again." }; // honeypot: people never see this field
  const bucket = `guestscan:${await clientIp()}`;
  if ((await fails(bucket, 60)) >= PER_HOUR) return { error: "That is a lot of scans from one place. Please try again in a little while." };
  await recordFail(bucket);

  const file = fd.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your resume first (PDF, DOCX or TXT)." };
  if (file.size > MAX_BYTES) return { error: "That file is too large. The limit is 5 MB." };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!["pdf", "docx", "txt"].includes(ext)) return { error: "Please upload a .pdf, .docx or .txt file." };
  const name = file.name.replace(/[^\p{L}\p{N}_ .\-()]+/gu, "_").slice(0, 160);

  try {
    const result = scoreExtraction(await extractFile(new Uint8Array(await file.arrayBuffer()), name));
    if (!isScored(result)) return { error: gateMessage(result.gate) };
    if (result.extraction.text_length < 80) return { error: "We could not read enough text from that file. It may be a scanned PDF. Try a DOCX or a text-based PDF." };
    await putSessionData({ [GUEST_KEY]: summarize(result, result.extraction.text, { name, mime: file.type || "application/octet-stream", size: file.size }) });
  } catch (e) {
    if (e instanceof ExtractError) return { error: e.message };
    console.error("[guest-scan] failed:", (e as Error).message);
    return { error: "Something went wrong while scanning. Please try again." };
  }
  const s = await getSession();
  redirect(s?.user?.role === "student" ? "/passport" : "/score");
}
