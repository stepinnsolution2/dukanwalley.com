"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type State = {
  configured: boolean;
  written: number;
  total: number;
  run: { running: boolean; total: number; done: number; failed: { id: string; error: string }[] };
};

/** AI description progress and bulk runs, above the product list. */
export function AiDescriptionsPanel({ selected, canEdit }: { selected: string[]; canEdit: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/products/describe");
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const running = state?.run.running ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [running, refresh]);

  async function start(body: Record<string, unknown>, count: number) {
    if (!confirm(`Write AI descriptions for ${count} product(s)? This replaces their current descriptions and uses your Anthropic credit.`)) return;
    setError(null);
    const res = await fetch("/api/admin/products/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setError(j.error ?? "Could not start");
    await refresh();
  }

  if (!state) return null;
  const missing = state.total - state.written;
  const r = state.run;
  return (
    <section className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">AI descriptions:</span>
        <span>
          {state.written} of {state.total} products written
        </span>
        {!state.configured ? (
          <Link href="/admin/settings" className="text-violet-800 underline">
            Add your Anthropic API key in Settings to start
          </Link>
        ) : canEdit && !running ? (
          <>
            {missing > 0 ? (
              <button type="button" onClick={() => start({ allMissing: true }, Math.min(missing, 500))} className="rounded border border-violet-700 bg-white px-2 py-1 text-xs text-violet-800">
                Write for all {missing} without one
              </button>
            ) : null}
            {selected.length ? (
              <button type="button" onClick={() => start({ ids: selected }, selected.length)} className="rounded border border-violet-700 bg-white px-2 py-1 text-xs text-violet-800">
                Write for {selected.length} selected
              </button>
            ) : null}
          </>
        ) : null}
        {running ? (
          <span className="text-violet-800">
            Writing… {r.done} of {r.total} done (you can leave this page)
          </span>
        ) : r.total ? (
          <span className="text-zinc-600">
            Last run: {r.done - r.failed.length} written{r.failed.length ? `, ${r.failed.length} failed` : ""}
          </span>
        ) : null}
      </div>
      {r.failed.length ? <p className="mt-1 text-xs text-red-700">Last error: {r.failed[r.failed.length - 1].error}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
