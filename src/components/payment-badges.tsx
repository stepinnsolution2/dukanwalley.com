import type { MarketPaymentMethod } from "@/lib/markets";

// Text-and-colour marks, not official logo files. Swap in the brands' artwork once you
// have it from each provider's merchant kit.
const chip = "flex h-9 min-w-16 items-center justify-center rounded-md border border-zinc-200 bg-white px-2";

function Visa() {
  return (
    <span className={chip} title="Visa">
      <span className="text-sm font-black italic tracking-tight text-[#1a1f71]">VISA</span>
    </span>
  );
}

function Mastercard() {
  return (
    <span className={chip} title="Mastercard">
      <svg viewBox="0 0 38 24" className="h-5" aria-hidden>
        <circle cx="14" cy="12" r="9" fill="#eb001b" />
        <circle cx="24" cy="12" r="9" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
      <span className="sr-only">Mastercard</span>
    </span>
  );
}

function Wordmark({ label, className }: { label: string; className: string }) {
  return (
    <span className={chip} title={label}>
      <span className={`text-xs font-bold ${className}`}>{label}</span>
    </span>
  );
}

function Cash() {
  return (
    <span className={`${chip} gap-1.5`} title="Cash on delivery">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
      <span className="text-xs font-semibold text-emerald-800">Cash on delivery</span>
    </span>
  );
}

const BADGES: Record<MarketPaymentMethod, React.ReactNode> = {
  CASH_ON_DELIVERY: <Cash key="cod" />,
  CARD: (
    <>
      <Visa key="visa" />
      <Mastercard key="mc" />
    </>
  ),
  STRIPE: (
    <>
      <Visa key="visa" />
      <Mastercard key="mc" />
    </>
  ),
  JAZZCASH: <Wordmark key="jc" label="JazzCash" className="text-[#c8102e]" />,
  EASYPAISA: <Wordmark key="ep" label="easypaisa" className="text-[#1db954]" />,
};

/** "We accept" strip for the payment methods available in the shopper's market. */
export function PaymentBadges({ methods }: { methods: MarketPaymentMethod[] }) {
  if (!methods.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-800">We accept</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {methods.map((m) => (
          <span key={m} className="contents">
            {BADGES[m]}
          </span>
        ))}
      </div>
    </div>
  );
}
