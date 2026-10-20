"use client";

/**
 * A GET form that applies itself when a checkbox, radio or select changes, so filters update
 * without an Apply click. Text/number inputs apply on Enter (or the Apply button).
 */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      action="/products"
      className={className}
      onChange={(e) => {
        const t = e.target as EventTarget;
        if (
          t instanceof HTMLSelectElement ||
          (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio"))
        ) {
          e.currentTarget.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
