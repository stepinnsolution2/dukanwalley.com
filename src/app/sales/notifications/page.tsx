"use client";

import { useEffect, useState } from "react";

type N = { id: string; title: string; body: string; read: boolean; createdAt: string };

async function fetchNotifications(): Promise<N[]> {
  const res = await fetch("/api/notifications");
  const j = await res.json();
  return j.notifications ?? [];
}

export default function SalesNotificationsPage() {
  const [items, setItems] = useState<N[]>([]);
  async function load() {
    setItems(await fetchNotifications());
  }
  useEffect(() => {
    let ignore = false;
    void fetchNotifications().then((n) => {
      if (!ignore) setItems(n);
    });
    return () => {
      ignore = true;
    };
  }, []);

  async function markRead() {
    const unread = items.filter((i) => !i.read).map((i) => i.id);
    if (!unread.length) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread }),
    });
    void load();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button
          type="button"
          onClick={markRead}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
        >
          Mark all read
        </button>
      </div>
      <ul className="mt-6 space-y-3">
        {items.map((n) => (
          <li
            key={n.id}
            className={`rounded-xl border px-4 py-3 text-sm ${n.read ? "border-zinc-200 bg-white" : "border-teal-200 bg-teal-50"}`}
          >
            <p className="font-medium">{n.title}</p>
            <p className="mt-1 text-zinc-700">{n.body}</p>
            <p className="mt-2 text-xs text-zinc-400">{new Date(n.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="mt-6 text-zinc-500">No notifications.</p> : null}
    </div>
  );
}
