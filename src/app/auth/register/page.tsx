"use client";

import Link from "next/link";
import { useState } from "react";
import { PAGE_FORM } from "@/lib/page-layout";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "customer",
        email,
        password,
        name,
        phone: phone || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error?.message ?? "Registration failed");
      return;
    }
    setMsg("Account created. You can sign in.");
  }

  return (
    <main className={PAGE_FORM}>
      <h1 className="text-2xl font-semibold">Create customer account</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Password (8+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {err ? <p className="text-sm text-red-600">{String(err)}</p> : null}
        {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white"
        >
          Register
        </button>
      </form>
      <p className="mt-4 text-sm">
        Want to sell?{" "}
        <Link href="/vendor/register" className="text-teal-700 hover:underline">
          Vendor registration
        </Link>
      </p>
    </main>
  );
}
