"use client";

import { useEffect } from "react";

export function ProductViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    // The server identifies the shopper by their login or cart cookie.
    void fetch(`/api/products/${slug}/view`, { method: "POST" });
  }, [slug]);
  return null;
}
