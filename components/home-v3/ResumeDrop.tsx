"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, FileText, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { scanResumeAction, type ScanState } from "@/app/start/actions";

const none: ScanState = {};
const MAX = 5 * 1024 * 1024;
const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Go({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={!ready || pending} className="hx-btn hx-btn-pri min-h-[52px] w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Scanning your resume…</> : <>Upload resume and get my QR Score <ArrowRight className="h-4 w-4" aria-hidden /></>}
    </button>
  );
}

/**
 * The home page's resume box: drop a resume, see a QR Score in seconds, no account needed. Everything else on the site stays open; this is the quickest way in.
 */
export default function ResumeDrop() {
  const [s, action] = useActionState(scanResumeAction, none);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/portal/me").then((r) => r.json()).then((j) => { if (live && j?.user?.name) setWho(String(j.user.name).split(" ")[0]); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const pick = (f: File | null) => {
    setProblem(null);
    if (!f) { setFile(null); return; }
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext)) { setFile(null); setProblem("Please choose a PDF, DOCX or TXT file."); return; }
    if (f.size > MAX) { setFile(null); setProblem("That file is over 5 MB. Please choose a smaller one."); return; }
    setFile(f);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f && input.current) { const dt = new DataTransfer(); dt.items.add(f); input.current.files = dt.files; }
    pick(f);
  };

  return (
    <form action={action} id="resume-drop" className="mt-8 w-full max-w-[34rem]" aria-labelledby="rd-h">
      <p id="rd-h" className="mb-2 text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-[var(--hx-cyan)]">Start here · free</p>
      <div className="hidden" aria-hidden><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label
        htmlFor="rd-file"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-7 text-center transition focus-within:ring-4 focus-within:ring-[var(--hx-cyan)]/30 ${over ? "border-[var(--hx-cyan)] bg-white/[0.12]" : "border-white/30 bg-white/[0.06] hover:border-white/60 hover:bg-white/[0.09]"}`}
      >
        {file ? <FileText className="h-9 w-9 text-[var(--hx-cyan)]" aria-hidden /> : <UploadCloud className="h-9 w-9 text-[var(--hx-cyan)]" aria-hidden />}
        <span className="text-[1.05rem] font-semibold text-white">{file ? file.name : "Drop your resume here"}</span>
        <span className="text-[0.84rem] text-white/65">{file ? `${kb(file.size)} · ready to scan` : "or click to choose a file · PDF, DOCX or TXT · up to 5 MB"}</span>
        <input ref={input} id="rd-file" name="resume" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      {problem || s.error ? <p role="alert" className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-[0.86rem] text-red-100">{problem ?? s.error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Go ready={!!file} />
        {who ? <Link href="/account" className="text-[0.9rem] font-semibold text-white/85 underline underline-offset-4 hover:text-white">Welcome back, {who}. Open my dashboard</Link> : null}
      </div>
      <p className="mt-3 flex items-start gap-2 text-[0.78rem] leading-snug text-white/55">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        You see your score without signing up. We keep your scan for up to 24 hours so you can save it, then delete it. We never share your resume.
      </p>
    </form>
  );
}
