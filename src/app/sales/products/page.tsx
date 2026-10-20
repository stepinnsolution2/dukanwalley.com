"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, type MarketCode } from "@/lib/markets";

type P = {
  id: string;
  name: string;
  approvalStatus: string;
  rejectionReason?: string | null;
  basePrice: unknown;
  stock: number;
  displayOnStorefront: boolean;
  availableForSale: boolean;
  images: { url: string }[];
  videos: { url: string }[];
  category: { name: string };
  vendor: { storeName: string; market: MarketCode };
};

const statusStyle: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function SalesProductsPage() {
  const [products, setProducts] = useState<P[]>([]);
  useEffect(() => {
    let ignore = false;
    void fetch("/api/sales/products")
      .then((r) => r.json())
      .then((j) => {
        if (!ignore) setProducts(j.products ?? []);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My products</h1>
        <Link href="/sales/products/new" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          Add product
        </Link>
      </div>
      <ul className="mt-6 space-y-3">
        {products.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100">
              {p.images[0] ? <Image src={p.images[0].url} alt="" fill unoptimized className="object-cover" sizes="64px" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle[p.approvalStatus] ?? ""}`}>
                  {p.approvalStatus.replace("_", " ").toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatMoney(p.vendor.market, Number(p.basePrice))} · {p.vendor.storeName} · {p.category.name} · stock{" "}
                {p.stock} · {p.images.length} images, {p.videos.length} videos
                {p.approvalStatus === "APPROVED"
                  ? p.availableForSale
                    ? " · live and for sale"
                    : p.displayOnStorefront
                      ? " · visible, not for sale"
                      : " · hidden"
                  : ""}
              </p>
              {p.rejectionReason ? <p className="mt-1 text-red-700">Reason: {p.rejectionReason}</p> : null}
              {p.approvalStatus !== "APPROVED" ? (
                <Link href={`/sales/products/${p.id}/edit`} className="mt-1 inline-block text-teal-700 hover:underline">
                  Edit{p.approvalStatus === "REJECTED" ? " and resubmit" : ""}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {products.length === 0 ? <p className="mt-6 text-zinc-500">No products yet.</p> : null}
    </div>
  );
}
