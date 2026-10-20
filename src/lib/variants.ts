// Product variant helpers. Pure functions: safe to import from client components.

export type VariantOptions = Record<string, string>;

/** Variant attribute that drives colour-specific photos. */
export function isColorKey(key: string) {
  return /^colou?r$/i.test(key);
}

/** Canonical, order-independent key for a set of options: "color=Yellow;size=41". */
export function optionsKey(options: VariantOptions) {
  return Object.keys(options)
    .sort()
    .map((k) => `${k}=${options[k]}`)
    .join(";");
}

/** "Size: 41 · Color: Yellow", using attribute names when known. */
export function variantLabel(options: VariantOptions, names: Record<string, string> = {}) {
  return Object.entries(options)
    .map(([k, v]) => `${names[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ")}: ${v}`)
    .join(" · ");
}

/** Every combination of the chosen values, in axis order. Axes with no values are skipped. */
export function combinations(axes: { key: string; values: string[] }[]): VariantOptions[] {
  let out: VariantOptions[] = [{}];
  for (const axis of axes) {
    if (!axis.values.length) continue;
    out = out.flatMap((combo) => axis.values.map((v) => ({ ...combo, [axis.key]: v })));
  }
  return out.length === 1 && Object.keys(out[0]).length === 0 ? [] : out;
}
