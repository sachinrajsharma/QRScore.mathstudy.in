"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart/store";

/** The header's cart icon with the number of items. Always shown; while online payment is off the cart and checkout run as a preview. */
export default function CartLink() {
  const { skus, ready } = useCart();
  if (!ready) return null;
  return (
    <a href="/cart" aria-label={`Cart, ${skus.length} ${skus.length === 1 ? "item" : "items"}`} className="relative grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-white/70 transition hover:border-orange">
      <ShoppingCart className="h-[18px] w-[18px]" aria-hidden />
      {skus.length ? <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-orange-deep px-1 text-[11px] font-bold leading-none text-white">{skus.length}</span> : null}
    </a>
  );
}
