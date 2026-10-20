"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SalesNotifications() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/notifications/count");
      const j = await res.json();
      setCount(j.count ?? 0);
    })();
    const t = setInterval(async () => {
      const res = await fetch("/api/notifications/count");
      const j = await res.json();
      setCount(j.count ?? 0);
    }, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <Link
      href="/sales/notifications"
      className="relative rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
    >
      Alerts
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
