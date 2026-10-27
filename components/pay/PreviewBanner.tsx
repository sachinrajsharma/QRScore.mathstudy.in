import { Info } from "lucide-react";

/** Shown on the cart and checkout while no payment provider is switched on, so a demo can walk through buying without anyone thinking a payment was taken. */
export default function PreviewBanner({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-[0.92rem] leading-snug text-amber-950 ${className}`}>
      <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p><b>Online payments are not active on this site.</b> This is a demo of the buying journey, so you can add items, review the order and open checkout, but no payment can be made and nothing will be charged.</p>
    </div>
  );
}
