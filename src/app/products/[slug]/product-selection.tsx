"use client";

import { createContext, useContext, useState } from "react";

/** Shares the shopper's chosen colour between the option picker and the photo gallery. */
const SelectionContext = createContext<{ color: string | null; setColor: (c: string | null) => void }>({
  color: null,
  setColor: () => {},
});

export function ProductSelectionProvider({ children }: { children: React.ReactNode }) {
  const [color, setColor] = useState<string | null>(null);
  return <SelectionContext.Provider value={{ color, setColor }}>{children}</SelectionContext.Provider>;
}

export function useProductSelection() {
  return useContext(SelectionContext);
}
