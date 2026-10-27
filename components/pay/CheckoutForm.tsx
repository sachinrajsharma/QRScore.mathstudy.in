"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock, ShieldCheck, Tag } from "lucide-react";
import { formatMoney } from "@/lib/pay/money";
import type { Quote } from "@/lib/pay/quote";

/**
 * The checkout form. It shows a price preview from the server (never computed here), collects billing details, and starts payment.
 * Card, UPI and bank details are entered only on the provider's own page or secure window; this page never sees them.
 */
interface Props {
  items: Array<{ sku: string; qty: number }>;
  initialCoupon: string;
  initialCountry: string;
  countries: Array<{ code: string; name: string }>;
  user: { name: string; email: string } | null;
  initial: Quote | null;
  initialError: string | null;
  returnPath: string;
  /** No payment provider is on: everything is shown, but the pay button is replaced by a notice. */
  preview?: boolean;
}

type Phase = "idle" | "pricing" | "creating" | "redirecting" | "razorpay" | "error";
type Descriptor = { kind: "redirect"; url: string } | { kind: "razorpay"; keyId: string; orderId: string; amountMinor: number; currency: string; name: string; description: string; prefill: { name: string; email: string }; notes: Record<string, string> };

type RzCtor = new (o: Record<string, unknown>) => { open(): void; on(e: string, f: (r: unknown) => void): void };
const rzOf = (): RzCtor | undefined => (window as unknown as { Razorpay?: RzCtor }).Razorpay;

const input = "w-full min-h-[46px] rounded-xl border border-black/[0.15] bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink focus:ring-4 focus:ring-black/5";
const label = "mb-1.5 block text-[13.5px] font-semibold text-ink-2";
const money = (n: number, c: string): string => formatMoney(n, c, c === "INR" ? "en-IN" : "en-US");

async function api<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data?: T; error?: { code: string; message: string; details?: { orderId?: string; available?: string[] } } }> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
  return { ok: r.ok, status: r.status, data: j.data, error: j.error };
}

function loadRazorpay(): Promise<boolean> {
  if (rzOf()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function CheckoutForm({ items, initialCoupon, initialCountry, countries, user, initial, initialError, returnPath, preview = false }: Props) {
  const router = useRouter();
  const [country, setCountry] = useState(initialCountry);
  const [currency, setCurrency] = useState<string | undefined>(initial?.currency);
  const [couponInput, setCouponInput] = useState(initialCoupon);
  const [coupon, setCoupon] = useState(initialCoupon);
  const [quote, setQuote] = useState<Quote | null>(initial);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [postal, setPostal] = useState("");
  const [taxId, setTaxId] = useState("");
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>(initial ? "idle" : "error");
  const [message, setMessage] = useState<string | null>(initialError);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const refresh = useCallback(async (c: string, cur: string | undefined, cp: string) => {
    const mine = ++seq.current;
    setPhase("pricing");
    const r = await api<Quote>("/api/v1/orders/quote", { items, country: c, currency: cur, coupon: cp || undefined, email: email || undefined });
    if (mine !== seq.current) return; // a newer request replaced this one
    if (r.ok && r.data) { setQuote(r.data); setCurrency(r.data.currency); setMessage(null); setPhase("idle"); }
    else {
      setQuote(null);
      setMessage(r.error?.code === "currency_not_available" ? "That currency is not available for this basket. Pick another." : r.error?.message ?? "We could not price this order.");
      setPhase("error");
    }
  }, [items, email]);

  const firstRun = useRef(true);
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } void refresh(country, currency, coupon); }, [country, currency, coupon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (message && alertRef.current) alertRef.current.focus(); }, [message]);

  const total = quote ? money(quote.totalMinor, quote.currency) : null;
  const busy = phase === "pricing" || phase === "creating" || phase === "redirecting" || phase === "razorpay";

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter your full name.";
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email.trim())) e.email = "Enter a valid email address. Your receipt is sent here.";
    if (!agree) e.agree = "Please confirm that you agree to continue.";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  const idemKey = useMemo(() => () => {
    const k = JSON.stringify([items, country, currency, coupon, email, name]);
    try {
      const saved = sessionStorage.getItem("pay-idem");
      if (saved) { const p = JSON.parse(saved) as { k: string; v: string }; if (p.k === k) return p.v; }
      const v = `ck-${crypto.randomUUID()}`;
      sessionStorage.setItem("pay-idem", JSON.stringify({ k, v }));
      return v;
    } catch { return `ck-${crypto.randomUUID()}`; }
  }, [items, country, currency, coupon, email, name]);

  async function pay() {
    if (!quote || busy || !validate()) return;
    setMessage(null);
    setPhase("creating");
    const body = {
      items, country, currency: quote.currency, coupon: quote.coupon ?? undefined,
      billing: { name: name.trim(), email: email.trim().toLowerCase(), taxId: taxId.trim() || undefined, address: { line1: line1.trim() || undefined, city: city.trim() || undefined, state: stateName.trim() || undefined, postalCode: postal.trim() || undefined } },
    };
    const r = await api<{ order: { id: string }; checkout: Descriptor | null; paid: boolean; accessToken?: string }>("/api/v1/orders", body, { "Idempotency-Key": idemKey() });
    if (!r.ok || !r.data) {
      if (r.status === 401) { router.push(`/login?next=${encodeURIComponent(returnPath)}`); return; }
      setPendingOrder(r.error?.details?.orderId ?? null);
      setMessage(r.status === 429 ? "You have started several checkouts. Please wait a few minutes and try again." : r.error?.message ?? "We could not start the payment. You have not been charged. Please try again.");
      setPhase("error");
      return;
    }
    const { order, checkout, paid, accessToken } = r.data;
    try { sessionStorage.removeItem("pay-idem"); if (accessToken) sessionStorage.setItem(`pay-token-${order.id}`, accessToken); } catch { /* storage is optional */ }
    const k = accessToken ? `?k=${encodeURIComponent(accessToken)}` : "";
    setPendingOrder(order.id);
    if (paid || !checkout) { router.push(`/checkout/status/${order.id}${k}`); return; }
    if (checkout.kind === "redirect") { setPhase("redirecting"); window.location.assign(checkout.url); return; }
    setPhase("razorpay");
    const Rz = (await loadRazorpay()) ? rzOf() : undefined;
    if (!Rz) { setMessage("The secure payment window could not load. Check your connection and try again. You have not been charged."); setPhase("error"); return; }
    const rz = new Rz({
      key: checkout.keyId, order_id: checkout.orderId, amount: checkout.amountMinor, currency: checkout.currency, name: checkout.name, description: checkout.description, prefill: checkout.prefill, notes: checkout.notes,
      theme: { color: "#111111" },
      handler: async (resp: { razorpay_payment_id?: string; razorpay_signature?: string }) => {
        // Razorpay says the customer finished. We still ask the server to verify with Razorpay before anything is granted.
        await api(`/api/v1/orders/${order.id}/confirm`, { razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }, {});
        router.push(`/checkout/status/${order.id}${k}`);
      },
      modal: { ondismiss: () => { setMessage("The payment window was closed before the payment finished. You have not been charged unless your bank confirms it; you can try again below."); setPhase("error"); } },
    });
    rz.on("payment.failed", () => { setMessage("The payment did not go through. You have not been charged. Try again or use another payment method."); setPhase("error"); });
    rz.open();
  }

  const retryStatus = pendingOrder ? `/checkout/status/${pendingOrder}` : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
      <form onSubmit={(e) => { e.preventDefault(); if (!preview) void pay(); }} noValidate aria-describedby={message ? "checkout-alert" : undefined} className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-[1.25rem] font-semibold text-ink">Your details</h2>
        <p className="mt-1 text-[0.9rem] text-ink-3">We use these only for your receipt and for taxes.</p>

        {message ? (
          <div id="checkout-alert" ref={alertRef} tabIndex={-1} role="alert" className="mt-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[0.9rem] text-red-800 outline-none">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>{message}{retryStatus ? <> <Link href={retryStatus} className="font-semibold underline">Check this order</Link>.</> : null}</div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="co-name" className={label}>Full name</label>
            <input id="co-name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "co-name-err" : undefined} />
            {fieldErrors.name ? <p id="co-name-err" className="mt-1 text-[0.82rem] text-red-700">{fieldErrors.name}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="co-email" className={label}>Email</label>
            <input id="co-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "co-email-err" : undefined} readOnly={!!user} />
            {fieldErrors.email ? <p id="co-email-err" className="mt-1 text-[0.82rem] text-red-700">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label htmlFor="co-country" className={label}>Country</label>
            <select id="co-country" className={input} value={country} onChange={(e) => { setCountry(e.target.value); setCurrency(undefined); }} autoComplete="country">
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="co-currency" className={label}>Pay in</label>
            <select id="co-currency" className={input} value={quote?.currency ?? ""} onChange={(e) => setCurrency(e.target.value)} disabled={!quote || quote.currencies.length < 2}>
              {(quote?.currencies ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <details className="mt-6 rounded-xl border border-black/10 p-4">
          <summary className="cursor-pointer text-[0.92rem] font-semibold text-ink">Billing address and tax number (optional)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="co-line1" className={label}>Address</label><input id="co-line1" className={input} value={line1} onChange={(e) => setLine1(e.target.value)} autoComplete="address-line1" /></div>
            <div><label htmlFor="co-city" className={label}>City</label><input id="co-city" className={input} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></div>
            <div><label htmlFor="co-state" className={label}>State or region</label><input id="co-state" className={input} value={stateName} onChange={(e) => setStateName(e.target.value)} autoComplete="address-level1" /></div>
            <div><label htmlFor="co-postal" className={label}>Postal code</label><input id="co-postal" className={input} value={postal} onChange={(e) => setPostal(e.target.value)} autoComplete="postal-code" /></div>
            <div><label htmlFor="co-tax" className={label}>Tax number (GSTIN, VAT ID ...)</label><input id="co-tax" className={input} value={taxId} onChange={(e) => setTaxId(e.target.value)} /></div>
          </div>
        </details>

        <div className="mt-6">
          <label htmlFor="co-coupon" className={label}>Coupon code</label>
          <div className="flex gap-2">
            <input id="co-coupon" className={input} value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setCoupon(couponInput.trim())} disabled={busy} className="min-h-[46px] shrink-0 rounded-xl border border-black/15 px-4 text-[0.9rem] font-semibold text-ink hover:bg-cream-2 disabled:opacity-50">Apply</button>
          </div>
          {quote?.couponError ? <p className="mt-1.5 text-[0.84rem] text-red-700" role="status">{quote.couponError}</p> : null}
          {quote?.coupon && !quote.couponError ? <p className="mt-1.5 flex items-center gap-1.5 text-[0.84rem] text-emerald-700" role="status"><Tag className="h-3.5 w-3.5" aria-hidden /> Coupon {quote.coupon} applied.</p> : null}
        </div>

        <div className="mt-6">
          <label className="flex items-start gap-3 text-[0.9rem] leading-snug text-ink-2">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-black" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-invalid={!!fieldErrors.agree} aria-describedby={fieldErrors.agree ? "co-agree-err" : undefined} />
            <span>I agree to the <Link href="/refund-policy" target="_blank" className="font-semibold underline">refund and cancellation policy</Link> and the <Link href="/privacy-policy" target="_blank" className="font-semibold underline">privacy policy</Link>, and I understand I am paying {total ?? "the amount shown"}.</span>
          </label>
          {fieldErrors.agree ? <p id="co-agree-err" className="mt-1 text-[0.82rem] text-red-700">{fieldErrors.agree}</p> : null}
        </div>

        {preview ? (
          <button type="button" disabled aria-disabled="true" className="mt-7 inline-flex min-h-[54px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-black/15 px-6 text-[1rem] font-bold text-ink-3">
            <Lock className="h-4 w-4" aria-hidden /> Online payments are not active (demo only)
          </button>
        ) : quote?.requiresLogin ? (
          <p className="mt-6 rounded-xl bg-cream-2 px-4 py-3 text-[0.9rem] text-ink-2">You need an account to buy this. <Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="font-semibold underline">Log in</Link> or <Link href={`/signup?next=${encodeURIComponent(returnPath)}`} className="font-semibold underline">create a free account</Link>, then come back here.</p>
        ) : (
          <button type="submit" disabled={!quote || busy} className="mt-7 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[1rem] font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {phase === "pricing" ? "Updating price" : phase === "razorpay" ? "Waiting for the payment window" : phase === "redirecting" ? "Taking you to the secure payment page" : "Starting your payment"}</> : <><Lock className="h-4 w-4" aria-hidden /> {quote ? `Pay ${total}` : "Pay"}</>}
          </button>
        )}
        <p className="mt-4 flex items-start gap-2 text-[0.8rem] leading-snug text-ink-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> You pay on {quote?.providers.length ? quote.providers.map((p) => (p === "razorpay" ? "Razorpay" : "Stripe")).join(" or ") : "the payment provider"}&rsquo;s secure page or window. Card, UPI and bank details never reach GrowQR.</p>
      </form>

      <aside aria-labelledby="co-summary" className="h-fit rounded-3xl border border-black/10 bg-white p-6 shadow-sm sm:p-8 lg:sticky lg:top-32">
        <h2 id="co-summary" className="text-[1.25rem] font-semibold text-ink">Order summary</h2>
        {quote ? (
          <>
            <ul className="mt-5 divide-y divide-black/[0.07]">
              {quote.lines.map((l) => (
                <li key={l.sku} className="flex justify-between gap-4 py-3 text-[0.94rem]">
                  <span className="text-ink-2">{l.title}{l.qty > 1 ? ` x ${l.qty}` : ""}</span>
                  <span className="font-medium text-ink">{money(l.unitMinor * l.qty, quote.currency)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-black/10 pt-4 text-[0.94rem]">
              {quote.discountMinor > 0 ? <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>-{money(quote.discountMinor, quote.currency)}</dd></div> : null}
              {quote.taxMinor > 0 ? <div className="flex justify-between text-ink-3"><dt>{quote.taxName || "Tax"} {quote.taxInclusive ? "(included)" : ""}</dt><dd>{money(quote.taxMinor, quote.currency)}</dd></div> : <div className="flex justify-between text-ink-3"><dt>Tax</dt><dd>None charged</dd></div>}
              <div className="flex items-baseline justify-between border-t border-black/10 pt-3"><dt className="text-[1rem] font-semibold text-ink">Total to pay</dt><dd className="text-[1.5rem] font-bold text-ink" aria-live="polite">{total}</dd></div>
            </dl>
            <p className="mt-4 text-[0.8rem] leading-snug text-ink-4">Charged in {quote.currency}. We do not add a currency conversion fee. If your card or bank is in another currency, they may convert the amount and charge their own fee.</p>
          </>
        ) : (
          <p className="mt-4 text-[0.92rem] text-ink-3">{phase === "pricing" ? "Working out your price..." : "We could not price this order. Change the country or currency, or go back and choose again."}</p>
        )}
      </aside>
    </div>
  );
}
