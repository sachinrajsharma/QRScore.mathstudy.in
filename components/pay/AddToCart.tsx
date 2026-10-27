"use client";

import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { addToCart, CART_MAX, useCart } from "@/lib/cart/store";
import { trackCatalog } from "@/lib/analytics";

/** "Add to cart" for one product code. Always shown; while online payment is off the cart and checkout run as a preview. */
export default function AddToCart({ sku, label = "Add to cart", compact = false, className = "" }: { sku: string; label?: string; compact?: boolean; className?: string }) {
  const { skus, ready } = useCart();
  if (!ready) return null;
  const inCart = skus.includes(sku);
  const base = `inline-flex items-center justify-center gap-2 rounded-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-deep ${compact ? "min-h-[40px] px-3 text-[13px]" : "min-h-[48px] px-6 text-[15px]"}`;
  if (inCart) {
    return (
      <Link href="/cart" className={`${base} border border-emerald-600/40 bg-emerald-50 text-emerald-900 ${className}`}>
        <Check className="h-4 w-4" aria-hidden /> In your cart. View cart
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { if (sku.startsWith("course-")) trackCatalog("course_enrol_click", { sku }); if (!addToCart(sku)) window.alert(`Your cart is full (${CART_MAX} items). Check out or remove something first.`); }}
      className={`${base} border border-black/[0.18] text-ink hover:bg-cream-2 ${className}`}
    >
      <ShoppingCart className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
