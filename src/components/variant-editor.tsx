"use client";

import { useState } from "react";
import type { AttributeDef } from "@/components/product-form";
import { combinations, optionsKey, variantLabel } from "@/lib/variants";

export type VariantRow = { stock: string; price: string; sku: string };

const cell = "w-full rounded border px-2 py-1 text-sm";

/** Chips for list attributes; free entry (Enter or comma) for text/number ones. */
function ValuePicker({
  def,
  values,
  onChange,
}: {
  def: AttributeDef;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const addDraft = () => {
    const parts = draft.split(",").map((p) => p.trim()).filter((p) => p && !values.includes(p));
    if (parts.length) onChange([...values, ...parts]);
    setDraft("");
  };

  return (
    <div>
      <p className="text-xs font-medium text-zinc-600">
        {def.name}
        {def.required ? " *" : ""} <span className="font-normal text-zinc-500">— select all that you offer</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {def.dataType === "select"
          ? def.options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                aria-pressed={values.includes(o)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  values.includes(o) ? "border-teal-700 bg-teal-700 text-white" : "border-zinc-300 hover:border-teal-600"
                }`}
              >
                {o}
              </button>
            ))
          : values.map((v) => (
              <span key={v} className="flex items-center gap-1 rounded-full bg-teal-700 py-1 pl-3 pr-1.5 text-sm text-white">
                {v}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  aria-label={`Remove ${v}`}
                  className="rounded-full px-1 leading-none hover:bg-white/20"
                >
                  ×
                </button>
              </span>
            ))}
        {def.dataType !== "select" ? (
          <input
            className="w-44 rounded border px-2 py-1 text-sm"
            inputMode={def.dataType === "number" ? "decimal" : undefined}
            placeholder={`Add ${def.name.toLowerCase()}, press Enter`}
            value={draft}
            onChange={(e) => {
              // Typing a comma adds what's before it (handy for "39, 40, 41").
              if (e.target.value.includes(",")) {
                const parts = e.target.value.split(",");
                const tail = parts.pop() ?? "";
                const add = parts.map((p) => p.trim()).filter((p) => p && !values.includes(p));
                if (add.length) onChange([...values, ...add]);
                setDraft(tail);
              } else setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            onBlur={addDraft}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Pick the sizes/colours a product comes in, then set stock (and optionally a price and
 * SKU) for every combination.
 */
export function VariantEditor({
  defs,
  values,
  onValues,
  rows,
  onRows,
  basePrice,
  currency,
}: {
  defs: AttributeDef[];
  values: Record<string, string[]>;
  onValues: (next: Record<string, string[]>) => void;
  rows: Record<string, VariantRow>;
  onRows: (next: Record<string, VariantRow>) => void;
  basePrice: string;
  currency: string;
}) {
  const [bulkStock, setBulkStock] = useState("");
  const combos = combinations(defs.map((d) => ({ key: d.key, values: values[d.key] ?? [] })));
  const names = Object.fromEntries(defs.map((d) => [d.key, d.name]));
  const row = (key: string): VariantRow => rows[key] ?? { stock: "0", price: "", sku: "" };
  const setRow = (key: string, patch: Partial<VariantRow>) => onRows({ ...rows, [key]: { ...row(key), ...patch } });
  const total = combos.reduce((s, c) => s + (Math.trunc(Number(row(optionsKey(c)).stock)) || 0), 0);

  return (
    <fieldset className="space-y-4 rounded-lg border border-zinc-200 p-3">
      <legend className="px-1 text-xs font-semibold text-zinc-700">Options shoppers choose</legend>
      {defs.map((d) => (
        <ValuePicker
          key={d.key}
          def={d}
          values={values[d.key] ?? []}
          onChange={(v) => onValues({ ...values, [d.key]: v })}
        />
      ))}

      {combos.length ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-600">
              {combos.length} combination{combos.length === 1 ? "" : "s"} · total stock {total}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              <input
                className="w-20 rounded border px-2 py-1 text-sm"
                inputMode="numeric"
                placeholder="Stock"
                value={bulkStock}
                onChange={(e) => setBulkStock(e.target.value)}
              />
              <button
                type="button"
                className="rounded border px-2 py-1 hover:border-teal-600"
                onClick={() => {
                  if (bulkStock === "") return;
                  const next = { ...rows };
                  for (const c of combos) next[optionsKey(c)] = { ...row(optionsKey(c)), stock: bulkStock };
                  onRows(next);
                }}
              >
                Set all
              </button>
            </div>
          </div>
          <div className="mt-2 max-h-96 overflow-auto rounded border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-xs text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Option</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Stock</th>
                  <th className="w-32 px-2 py-1.5 font-medium">Price ({currency})</th>
                  <th className="w-32 px-2 py-1.5 font-medium">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {combos.map((c) => {
                  const key = optionsKey(c);
                  const r = row(key);
                  return (
                    <tr key={key}>
                      <td className="px-2 py-1">{variantLabel(c, names)}</td>
                      <td className="px-2 py-1">
                        <input
                          className={cell}
                          inputMode="numeric"
                          value={r.stock}
                          onChange={(e) => setRow(key, { stock: e.target.value })}
                          aria-label={`Stock for ${variantLabel(c, names)}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={cell}
                          inputMode="decimal"
                          placeholder={basePrice || "Same"}
                          value={r.price}
                          onChange={(e) => setRow(key, { price: e.target.value })}
                          aria-label={`Price for ${variantLabel(c, names)}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={cell}
                          value={r.sku}
                          onChange={(e) => setRow(key, { sku: e.target.value })}
                          aria-label={`SKU for ${variantLabel(c, names)}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Leave price empty to use the product price. Set stock to 0 for combinations you don&apos;t have.</p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Choose values above to set stock for each combination.</p>
      )}
    </fieldset>
  );
}
