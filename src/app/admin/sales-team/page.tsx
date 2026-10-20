"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { can } from "@/lib/permissions";

export default function SalesTeamPage() {
  const { data: session } = useSession();
  const [list, setList] = useState<{ email: string; salesProfile?: { employeeCode?: string } }[]>(
    [],
  );
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    employeeCode: "",
  });

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/sales");
      const j = await res.json();
      setList(j.salesUsers ?? []);
    })();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ email: "", password: "", name: "", employeeCode: "" });
      const j = await fetch("/api/admin/sales").then((r) => r.json());
      setList(j.salesUsers ?? []);
    }
  }

  if (!can(session?.user?.role, "sales-team:manage")) {
    return (
      <p className="text-sm text-zinc-600">
        Only the company owner (super admin) can create sales accounts.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Sales team</h1>
      <form onSubmit={create} className="grid max-w-md gap-2">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Temp password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Employee code"
          value={form.employeeCode}
          onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
        />
        <button type="submit" className="rounded bg-teal-700 py-2 text-sm font-medium text-white">
          Add salesperson
        </button>
      </form>
      <ul className="text-sm">
        {list.map((u) => (
          <li key={u.email} className="border-b border-zinc-200 py-2">
            {u.email} {u.salesProfile?.employeeCode ? `· ${u.salesProfile.employeeCode}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
