import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import CheckoutForm from "@/components/pay/CheckoutForm";
import { databaseConfigured } from "@/lib/portal/db";
import { currentUser } from "@/lib/portal/guard";
import { countryOptions } from "@/lib/pay/countries";
import { PayError } from "@/lib/pay/orders";
import { quoteOrder, quoteSchema, type Quote } from "@/lib/pay/quote";
import { paymentsPreview } from "@/lib/pay/providers";
import PreviewBanner from "@/components/pay/PreviewBanner";

export const metadata: Metadata = { title: "Checkout | GrowQR", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Countries are guessed from the edge header when the host sends one (Cloudflare, Vercel). It is only a starting point the customer can change. */
async function guessCountry(): Promise<string> {
  const h = await headers();
  const c = (h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : "IN";
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <PageShell>
      <main className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="text-[1.8rem] font-bold text-ink">{title}</h1>
        <div className="mt-3 text-[1rem] text-ink-3">{children}</div>
        <Link href="/pricing" className="mt-8 inline-flex min-h-[48px] items-center rounded-xl bg-ink px-6 font-semibold text-white">Back to plans</Link>
      </main>
    </PageShell>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!databaseConfigured()) {
    return <Notice title="Online payment is not open yet">We are still switching on online payments. Please <Link href="/contact" className="font-semibold underline">contact us</Link> and we will help you get started.</Notice>;
  }
  const preview = paymentsPreview(); // no provider is on: show the whole checkout as a demo, with no way to pay
  const items = (sp.sku ?? "").split(",").filter(Boolean).slice(0, 10).map((s) => ({ sku: s.trim(), qty: 1 }));
  if (!items.length) return <Notice title="Nothing to buy">Choose a plan or product first.</Notice>;

  const me = await currentUser();
  const country = /^[A-Za-z]{2}$/.test(sp.country ?? "") ? (sp.country as string).toUpperCase() : await guessCountry();
  const coupon = (sp.coupon ?? "").slice(0, 40).toUpperCase();
  const returnPath = `/checkout?${new URLSearchParams({ sku: items.map((i) => i.sku).join(",") }).toString()}`;

  let initial: Quote | null = null;
  let initialError: string | null = null;
  try {
    const currency = /^[A-Za-z]{3}$/.test(sp.currency ?? "") ? (sp.currency as string).toUpperCase() : undefined;
    initial = await quoteOrder(quoteSchema.parse({ items, country, currency, coupon: coupon || undefined }), { userId: me?.id ?? null });
  } catch (e) {
    initialError = e instanceof PayError ? e.message : "We could not price this order. Please try again.";
    if (!(e instanceof PayError) && !(e instanceof Error && e.name === "ZodError")) console.error("checkout quote failed", e);
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:pt-32">
        <h1 className="text-[2rem] font-bold tracking-tight text-ink sm:text-[2.4rem]">Checkout</h1>
        <p className="mb-8 mt-2 text-ink-3">Review your order, then pay securely.</p>
        {preview ? <PreviewBanner className="mb-8" /> : null}
        <CheckoutForm preview={preview}items={items} initialCoupon={coupon} initialCountry={country} countries={countryOptions()} user={me ? { name: me.name, email: me.email } : null} initial={initial} initialError={initialError} returnPath={returnPath} />
      </main>
    </PageShell>
  );
}
