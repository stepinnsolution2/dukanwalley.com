// Display names for order statuses. Plain data: safe in client and server components.

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PLACED: "Awaiting confirmation",
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

export const ORDER_STATUS_STYLES: Record<string, string> = {
  PLACED: "bg-amber-100 text-amber-800",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-sky-100 text-sky-800",
  PAID: "bg-sky-100 text-sky-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-green-100 text-green-800",
  RETURNED: "bg-zinc-200 text-zinc-800",
  CANCELLED: "bg-red-100 text-red-800",
  DISPUTED: "bg-red-100 text-red-800",
};

export function statusBadgeClass(status: string) {
  return `inline-block rounded px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[status] ?? "bg-zinc-100"}`;
}
