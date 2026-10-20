"use client";

import { useState } from "react";

export function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setState("done");
      setMessage("Thanks! You're subscribed to deals and new arrivals.");
      setEmail("");
    } else {
      setState("error");
      setMessage(typeof j.error === "string" ? j.error : "Please try again");
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">
        Email
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="Your email for deals & new arrivals"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <button disabled={state === "busy"} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Subscribe
      </button>
      {message ? (
        <p className={`text-sm sm:basis-full ${state === "error" ? "text-red-600" : "text-green-700"}`}>{message}</p>
      ) : null}
    </form>
  );
}
