import { formatMoney, type MarketCode } from "@/lib/markets";
import type { PrivateFile } from "@/lib/private-files";
import type { AccountSummary, ThreadEntry } from "@/lib/vendor-account";
import { ConfirmPaymentButton, VoidPaymentButton } from "./account-thread-actions";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });

/** Earned / paid / due / in progress cards. */
export function AccountSummaryCards({ s, market, viewer }: { s: AccountSummary; market: MarketCode; viewer: "ADMIN" | "VENDOR" }) {
  const m = (c: number) => formatMoney(market, c / 100);
  const cards: [string, string, string, string?][] = [
    ["Earned (delivered)", m(s.earnedCents), `${s.deliveredOrders} delivered order${s.deliveredOrders === 1 ? "" : "s"}, after DukanWalley commission`],
    ["Paid so far", m(s.paidCents), "Payments recorded below"],
    [
      s.dueCents >= 0 ? (viewer === "ADMIN" ? "Due to vendor" : "Due to you") : "Paid in advance",
      m(Math.abs(s.dueCents)),
      s.dueCents >= 0 ? "Earned minus paid" : "Paid more than earned so far",
      s.dueCents > 0 ? "due" : undefined,
    ],
    ["In progress", m(s.inProgressCents), `${s.inProgressOrders} order${s.inProgressOrders === 1 ? "" : "s"} confirmed or on the way; earned once delivered`],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value, help, tone]) => (
        <div key={label} className={`rounded-xl border p-4 ${tone ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white"}`}>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className={`mt-1 text-xl font-semibold ${tone ? "text-amber-900" : "text-zinc-900"}`}>{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{help}</p>
        </div>
      ))}
    </div>
  );
}

function Attachments({ files }: { files: PrivateFile[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => {
        const href = `/api/account-files/${f.key}`;
        return f.type.startsWith("image/") ? (
          <a key={f.key} href={href} target="_blank" rel="noreferrer" title={f.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={href} alt={f.name} className="h-24 w-24 rounded-lg border border-zinc-200 object-cover hover:opacity-90" />
          </a>
        ) : (
          <a key={f.key} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50">
            📄 {f.name}
          </a>
        );
      })}
    </div>
  );
}

/** The conversation, oldest first: our entries on one side, the vendor's on the other. */
export function AccountThread({
  entries,
  market,
  viewer,
  canManage,
  vendorName,
}: {
  entries: ThreadEntry[];
  market: MarketCode;
  viewer: "ADMIN" | "VENDOR";
  canManage?: boolean;
  vendorName: string;
}) {
  if (!entries.length) {
    return <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">No payments or messages yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {entries.map((e) => {
        const mine = e.side === viewer;
        const who = e.side === "ADMIN" ? (viewer === "ADMIN" ? (e.authorName ?? "DukanWalley") : "DukanWalley") : viewer === "VENDOR" ? "You" : vendorName;
        const files = (e.attachments ?? []) as PrivateFile[];
        const payment = e.kind === "PAYMENT";
        return (
          <li key={e.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`w-full max-w-xl rounded-2xl border p-4 text-sm ${
                payment
                  ? e.voidedAt
                    ? "border-zinc-300 bg-zinc-50"
                    : "border-emerald-300 bg-emerald-50"
                  : mine
                    ? "border-teal-200 bg-teal-50"
                    : "border-zinc-200 bg-white"
              }`}
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-700">{who}</span>
                <span>{when.format(e.createdAt)}</span>
              </p>
              {payment ? (
                <div className="mt-2">
                  <p className={`text-lg font-semibold ${e.voidedAt ? "text-zinc-400 line-through" : "text-emerald-900"}`}>
                    💸 Payment {formatMoney(market, e.amount ?? 0)}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {[e.method, e.reference ? `Ref ${e.reference}` : null, e.paidOn ? `Paid ${day.format(e.paidOn)}` : null].filter(Boolean).join(" · ")}
                  </p>
                  {e.voidedAt ? (
                    <p className="mt-1 text-xs font-medium text-red-700">Voided: {e.voidReason}</p>
                  ) : e.confirmedAt ? (
                    <p className="mt-1 text-xs font-medium text-emerald-800">✓ Vendor confirmed receipt on {day.format(e.confirmedAt)}</p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-800">Not yet confirmed by the vendor</p>
                  )}
                </div>
              ) : null}
              {e.body ? <p className="mt-2 whitespace-pre-wrap text-zinc-800">{e.body}</p> : null}
              <Attachments files={files} />
              {payment && !e.voidedAt ? (
                <div className="mt-2 flex justify-end">
                  {viewer === "VENDOR" && !e.confirmedAt ? <ConfirmPaymentButton id={e.id} /> : null}
                  {viewer === "ADMIN" && canManage ? <VoidPaymentButton id={e.id} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
