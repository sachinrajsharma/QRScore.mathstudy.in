import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeProviders, payableCurrencies, paymentsPreview } from "./providers";

/** With no payment provider switched on the shop is a PREVIEW: prices show so the cart and checkout can be demonstrated, but nothing can be paid. */
const KEYS = ["RAZORPAY_KEY_ID", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "STRIPE_SECRET_KEY", "PAY_ENABLED_PROVIDERS"] as const;
const saved: Record<string, string | undefined> = {};

describe("payments preview", () => {
  beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("is on when no provider has keys, and then every priced currency is shown", () => {
    expect(activeProviders()).toHaveLength(0);
    expect(paymentsPreview()).toBe(true);
    expect(payableCurrencies("IN", ["INR", "USD"])).toEqual(["INR", "USD"]);
  });

  it("is on when providers have keys but are all switched off", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.PAY_ENABLED_PROVIDERS = "none";
    expect(paymentsPreview()).toBe(true);
  });

  it("is off, and currencies are filtered by what a provider can take, once a provider is live", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(activeProviders().map((p) => p.id)).toEqual(["stripe"]);
    expect(paymentsPreview()).toBe(false);
    expect(payableCurrencies("US", ["USD"])).toEqual(["USD"]);
  });
});
