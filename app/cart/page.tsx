import type { Metadata } from "next";
import { headers } from "next/headers";
import PageShell from "@/components/layout/PageShell";
import CartView from "@/components/pay/CartView";
import PreviewBanner from "@/components/pay/PreviewBanner";
import { paymentsPreview } from "@/lib/pay/providers";
import { countryOptions } from "@/lib/pay/countries";

export const metadata: Metadata = { title: "Your cart | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function guessCountry(): Promise<string> {
  const h = await headers();
  const c = (h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : "IN";
}

export default async function CartPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:pt-32">
        <h1 className="text-[2rem] font-bold tracking-tight text-ink sm:text-[2.4rem]">Your cart</h1>
        <p className="mb-8 mt-2 text-ink-3">Review what you are buying, then check out once.</p>
        {paymentsPreview() ? <PreviewBanner className="mb-8" /> : null}
        <CartView initialCountry={await guessCountry()} countries={countryOptions()} />
      </main>
    </PageShell>
  );
}
