import { cfg, type ProviderId } from "../config";
import { razorpay } from "./razorpay";
import { stripe } from "./stripe";
import type { PaymentProvider } from "./types";

/**
 * The provider registry and routing. A provider is offered only when it is switched on (PAY_ENABLED_PROVIDERS), has its keys, and supports
 * the customer's country and the order currency. Routing never "falls back" to a provider that does not support the currency.
 */
const REGISTRY: Record<ProviderId, PaymentProvider> = { razorpay, stripe };

export const getProvider = (id: string): PaymentProvider | null => (id === "razorpay" || id === "stripe" ? REGISTRY[id] : null);
export const allProviders = (): PaymentProvider[] => Object.values(REGISTRY);

export function activeProviders(): PaymentProvider[] {
  const on = cfg.enabledProviders();
  return allProviders().filter((p) => on.includes(p.id) && p.configured());
}

/** Providers that can take this payment, most suitable first. India and INR go to Razorpay; everything else to Stripe. */
export function providersFor(c: { country: string; currency: string }): PaymentProvider[] {
  const list = activeProviders().filter((p) => p.supports(c));
  const preferred: ProviderId = c.country.toUpperCase() === "IN" ? "razorpay" : "stripe";
  return list.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
}

export function selectProvider(c: { country: string; currency: string; requested?: string | null }): PaymentProvider | null {
  const options = providersFor(c);
  if (c.requested) return options.find((p) => p.id === c.requested) ?? null;
  return options[0] ?? null;
}

/**
 * True while no payment provider is switched on (no keys set). The shop then runs as a PREVIEW: the cart and the checkout page open and show real prices,
 * but nothing can be paid (creating an order still fails with "no_provider"). It lets a demo site show the whole buying journey.
 */
export const paymentsPreview = (): boolean => activeProviders().length === 0;

/** Currencies in which at least one active provider can take a payment from this country. In preview every currency the items are priced in is shown. */
export function payableCurrencies(country: string, candidates: string[]): string[] {
  if (paymentsPreview()) return candidates;
  return candidates.filter((cur) => providersFor({ country, currency: cur }).length > 0);
}
