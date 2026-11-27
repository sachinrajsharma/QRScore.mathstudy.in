"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-[44px] items-center rounded-lg bg-ink px-4 text-[14px] font-semibold text-white">Print or save as PDF</button>;
}
