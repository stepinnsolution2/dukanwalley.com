"use client";

import { useEffect, useState } from "react";
import { MediaUploader } from "@/components/media-uploader";
import { VariantEditor, type VariantRow } from "@/components/variant-editor";
import { MARKETS, type MarketCode } from "@/lib/markets";
import { combinations, isColorKey, optionsKey } from "@/lib/variants";

export type AttributeDef = {
  key: string;
  name: string;
  dataType: string;
  required: boolean;
  options: string[];
  /** Shopper chooses a value (Size, Color…): edited as variants, not a single field. */
  isVariant?: boolean;
};
type Category = { id: string; name: string; parentId: string | null; attributeDefs: AttributeDef[] };
export type FormVendor = { id: string; storeName: string; market: MarketCode; taxRegistered: boolean };

export type ProductFormInitial = {
  name: string;
  description: string | null;
  basePrice: string | number;
  salesTaxBps: number;
  stock: number;
  categoryId: string;
  vendorId: string;
  metadata: Record<string, unknown> | null;
  imageUrls: string[];
  videoUrls: string[];
  variants?: { options: unknown; stock: number; price: string | number | null; sku: string | null }[];
  /** Photo URL → colour it shows. */
  imageColors?: Record<string, string>;
  sku?: string | null;
  featuredPriority?: number;
  zoneTags?: string[];
  displayOnStorefront?: boolean;
  availableForSale?: boolean;
};

/** API errors are either a message string or a zod `flatten()` object. */
export function describeError(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const field = Object.entries(e.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(", ")}`);
    const all = [...(e.formErrors ?? []), ...field];
    if (all.length) return all.join(" · ");
  }
  return "Could not save";
}

const input = "mt-1 w-full rounded border px-3 py-2 text-sm disabled:bg-zinc-100";
const label = "text-xs font-medium text-zinc-600";

export function ProductForm({
  variant,
  initial,
  vendorEditable,
  currentVendor,
  submitLabel,
  onSubmit,
}: {
  variant: "sales" | "admin";
  initial?: ProductFormInitial;
  vendorEditable: boolean;
  /** The product's vendor, shown even if it's no longer in the eligible-vendor list. */
  currentVendor?: FormVendor;
  submitLabel: string;
  /** Sends the payload; resolves to an error message, or null on success. */
  onSubmit: (payload: Record<string, unknown>) => Promise<string | null>;
}) {
  // Pinned on mount so a parent re-render (new object identity) doesn't refetch.
  const [pinnedVendor] = useState(currentVendor);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<FormVendor[]>(pinnedVendor ? [pinnedVendor] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    basePrice: initial ? String(Number(initial.basePrice)) : "",
    taxPercent: initial ? String(initial.salesTaxBps / 100) : "0",
    stock: initial ? String(initial.stock) : "10",
    categoryId: initial?.categoryId ?? "",
    vendorId: initial?.vendorId ?? "",
    sku: initial?.sku ?? "",
    featuredPriority: String(initial?.featuredPriority ?? 0),
    zoneTags: (initial?.zoneTags ?? []).join(", "),
    displayOnStorefront: initial?.displayOnStorefront ?? false,
    availableForSale: initial?.availableForSale ?? false,
  });
  const [attrs, setAttrs] = useState<Record<string, unknown>>(initial?.metadata ?? {});
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrls ?? []);
  const [videoUrls, setVideoUrls] = useState<string[]>(initial?.videoUrls ?? []);
  const [imageColors, setImageColors] = useState<Record<string, string>>(initial?.imageColors ?? {});
  // Variant values per attribute key, in the order they were added, and a row per combination.
  const [variantValues, setVariantValues] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const v of initial?.variants ?? []) {
      for (const [k, val] of Object.entries(v.options as Record<string, string>)) {
        out[k] = out[k]?.includes(val) ? out[k] : [...(out[k] ?? []), val];
      }
    }
    return out;
  });
  const [variantRows, setVariantRows] = useState<Record<string, VariantRow>>(() =>
    Object.fromEntries(
      (initial?.variants ?? []).map((v) => [
        optionsKey(v.options as Record<string, string>),
        { stock: String(v.stock), price: v.price != null ? String(Number(v.price)) : "", sku: v.sku ?? "" },
      ]),
    ),
  );

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/vendors/public").then((r) => r.json()),
    ]).then(([c, v]) => {
      if (ignore) return;
      setCategories(c.categories ?? []);
      const list: FormVendor[] = v.vendors ?? [];
      setVendors(pinnedVendor && !list.some((x) => x.id === pinnedVendor.id) ? [pinnedVendor, ...list] : list);
      setF((s) => ({
        ...s,
        categoryId: s.categoryId || c.categories?.[0]?.id || "",
        vendorId: s.vendorId || list[0]?.id || "",
      }));
    });
    return () => {
      ignore = true;
    };
  }, [pinnedVendor]);

  const vendor = vendors.find((v) => v.id === f.vendorId);
  const m = vendor ? MARKETS[vendor.market] : null;
  const taxRegistered = vendor?.taxRegistered ?? false;
  const category = categories.find((c) => c.id === f.categoryId);
  // "Shoes › Women", sorted so subcategories sit under their parent.
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryPath = (c: Category, depth = 0): string => {
    const parent = c.parentId ? categoryById.get(c.parentId) : undefined;
    return parent && depth < 5 ? `${categoryPath(parent, depth + 1)} › ${c.name}` : c.name;
  };
  const categoryOptions = categories
    .map((c) => ({ id: c.id, path: categoryPath(c) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const variantDefs = category?.attributeDefs.filter((a) => a.isVariant) ?? [];
  const variantCombos = combinations(variantDefs.map((d) => ({ key: d.key, values: variantValues[d.key] ?? [] })));
  const hasVariants = variantCombos.length > 0;
  const variantStock = variantCombos.reduce(
    (s, c) => s + (Math.trunc(Number(variantRows[optionsKey(c)]?.stock)) || 0),
    0,
  );
  const colorDef = variantDefs.find((d) => isColorKey(d.key));
  const colorValues = colorDef ? (variantValues[colorDef.key] ?? []) : [];
  // Products can't change country (prices are in the vendor's currency).
  const vendorChoices = pinnedVendor ? vendors.filter((v) => v.market === pinnedVendor.market) : vendors;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const metadata = Object.fromEntries(
      Object.entries(attrs).filter(([, v]) => v !== "" && v !== undefined && v !== null),
    );
    const payload: Record<string, unknown> = {
      name: f.name.trim(),
      description: f.description,
      basePrice: Number(f.basePrice),
      salesTaxBps: taxRegistered ? Math.round(Number(f.taxPercent) * 100) : 0,
      stock: hasVariants ? variantStock : Math.trunc(Number(f.stock)),
      categoryId: f.categoryId,
      metadata,
      imageUrls,
      videoUrls,
      variants: variantCombos.map((options) => {
        const r = variantRows[optionsKey(options)];
        return {
          options,
          stock: Math.trunc(Number(r?.stock)) || 0,
          price: r?.price.trim() ? Number(r.price) : null,
          sku: r?.sku.trim() || undefined,
        };
      }),
      imageColors: Object.fromEntries(
        Object.entries(imageColors).filter(([url, c]) => imageUrls.includes(url) && colorValues.includes(c)),
      ),
    };
    if (vendorEditable) payload.vendorId = f.vendorId;
    if (variant === "admin") {
      payload.sku = f.sku.trim() || undefined;
      payload.featuredPriority = Math.trunc(Number(f.featuredPriority) || 0);
      payload.zoneTags = f.zoneTags.split(",").map((t) => t.trim()).filter(Boolean);
      payload.displayOnStorefront = f.displayOnStorefront;
      payload.availableForSale = f.displayOnStorefront && f.availableForSale;
    }
    const err = await onSubmit(payload);
    setSaving(false);
    setError(err);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className={label}>
        Name
        <input className={input} value={f.name} onChange={set("name")} required minLength={2} />
      </label>
      <label className={label}>
        Description
        <textarea className={input} rows={4} value={f.description} onChange={set("description")} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Vendor
          <select className={input} value={f.vendorId} onChange={set("vendorId")} disabled={!vendorEditable} required>
            {vendorChoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.storeName} · {MARKETS[v.market].name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Category
          <select
            className={input}
            value={f.categoryId}
            onChange={(e) => setF((s) => ({ ...s, categoryId: e.target.value }))}
            required
          >
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          Price{m ? ` (${m.currency}, incl. ${m.taxName})` : ""}
          <input className={input} inputMode="decimal" value={f.basePrice} onChange={set("basePrice")} required />
        </label>
        <label className={label}>
          {m?.taxName ?? "Tax"} % included
          <input
            className={input}
            inputMode="decimal"
            value={taxRegistered ? f.taxPercent : "0"}
            disabled={!taxRegistered}
            onChange={set("taxPercent")}
          />
        </label>
        <label className={label}>
          Stock{hasVariants ? " (total of options)" : ""}
          <input
            className={input}
            inputMode="numeric"
            value={hasVariants ? String(variantStock) : f.stock}
            onChange={set("stock")}
            disabled={hasVariants}
            required
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-zinc-500">
        {m && !taxRegistered
          ? `This vendor isn't registered for ${m.taxName} (no ${m.idLabels.taxRegNo}), so no tax is charged.`
          : `Enter the ${m?.taxName ?? "tax"} rate already included in the price.`}
        {m?.code === "PK" ? " Prices in Pakistan are whole rupees." : ""}
      </p>

      {variantDefs.length ? (
        <VariantEditor
          defs={variantDefs}
          values={variantValues}
          onValues={setVariantValues}
          rows={variantRows}
          onRows={setVariantRows}
          basePrice={f.basePrice}
          currency={m?.currency ?? ""}
        />
      ) : null}

      {category?.attributeDefs.some((a) => !a.isVariant) ? (
        <fieldset className="rounded-lg border border-zinc-200 p-3">
          <legend className="px-1 text-xs font-semibold text-zinc-700">{category.name} details</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {category.attributeDefs.filter((a) => !a.isVariant).map((a) => {
              const value = attrs[a.key];
              const setValue = (v: unknown) => setAttrs((s) => ({ ...s, [a.key]: v }));
              const title = `${a.name}${a.required ? " *" : ""}`;
              if (a.dataType === "boolean") {
                return (
                  <label key={a.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={value === true} onChange={(e) => setValue(e.target.checked)} />
                    {title}
                  </label>
                );
              }
              if (a.dataType === "select") {
                return (
                  <label key={a.key} className={label}>
                    {title}
                    <select className={input} value={String(value ?? "")} onChange={(e) => setValue(e.target.value)} required={a.required}>
                      <option value="">Choose…</option>
                      {a.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              return (
                <label key={a.key} className={label}>
                  {title}
                  <input
                    className={input}
                    inputMode={a.dataType === "number" ? "decimal" : undefined}
                    value={String(value ?? "")}
                    onChange={(e) => setValue(e.target.value)}
                    required={a.required}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div>
        <p className={label}>Images (first is the main image — click “Make main” on any image to change it)</p>
        <div className="mt-1">
          <MediaUploader
            kind="image"
            value={imageUrls}
            onChange={setImageUrls}
            max={12}
            tagOptions={colorValues}
            tags={imageColors}
            onTag={(url, c) => setImageColors((s) => ({ ...s, [url]: c }))}
          />
          {colorValues.length ? (
            <p className="mt-1 text-xs text-zinc-500">
              Tag each photo with the colour it shows, so picking a colour on the product page shows its photos.
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <p className={label}>Videos (optional)</p>
        <div className="mt-1">
          <MediaUploader kind="video" value={videoUrls} onChange={setVideoUrls} max={5} />
        </div>
      </div>

      {variant === "admin" ? (
        <fieldset className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-semibold text-zinc-700">Storefront</legend>
          <label className={label}>
            SKU
            <input className={input} value={f.sku} onChange={set("sku")} />
          </label>
          <label className={label}>
            Featured priority (higher shows first)
            <input className={input} inputMode="numeric" value={f.featuredPriority} onChange={set("featuredPriority")} />
          </label>
          <label className={label}>
            Zone tags (comma separated)
            <input className={input} value={f.zoneTags} onChange={set("zoneTags")} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.displayOnStorefront}
              onChange={(e) => setF((s) => ({ ...s, displayOnStorefront: e.target.checked }))}
            />
            Display on storefront
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.displayOnStorefront && f.availableForSale}
              disabled={!f.displayOnStorefront}
              onChange={(e) => setF((s) => ({ ...s, availableForSale: e.target.checked }))}
            />
            Available for sale
          </label>
        </fieldset>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={saving || imageUrls.length === 0}
        className="rounded bg-teal-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
      {imageUrls.length === 0 ? <p className="-mt-2 text-xs text-zinc-500">Add at least one image.</p> : null}
    </form>
  );
}
