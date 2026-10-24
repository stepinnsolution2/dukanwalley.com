import { z } from "zod";
import { pktDayEnd, pktDayStart } from "@/lib/ads";
import { PAYMENT_STATUSES, PLACEMENT_KEYS } from "@/lib/ad-placements";

// Validation shared by the advertising admin routes.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
/** An advertiser's site (http/https) or a page here ("/store/abc"); empty for no link. */
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/.test(v) || /^\/(?!\/)[^\s]*$/.test(v), "Link must start with https:// or /");

export const advertiserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(150)]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const bookingFields = {
  alt: z.string().trim().min(3).max(150),
  linkUrl: link,
  startDate: day,
  endDate: day,
  price: z.union([z.literal(""), z.coerce.number().int().min(0).max(100_000_000)]).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  notes: z.string().trim().max(2000).optional(),
};

export const createBookingSchema = z.object({
  advertiserId: z.string().min(1),
  placement: z.enum(PLACEMENT_KEYS as [string, ...string[]]),
  ...bookingFields,
});

export const updateBookingSchema = z.object({ ...bookingFields, isActive: z.boolean() }).partial();

/** Normalises form values into database fields (dates as Pakistan day bounds, blanks as null). */
export function bookingData(d: Partial<z.infer<typeof createBookingSchema>> & { isActive?: boolean }) {
  return {
    ...(d.alt !== undefined ? { alt: d.alt } : {}),
    ...(d.linkUrl !== undefined ? { linkUrl: d.linkUrl || null } : {}),
    ...(d.startDate !== undefined ? { startsAt: pktDayStart(d.startDate) } : {}),
    ...(d.endDate !== undefined ? { endsAt: pktDayEnd(d.endDate) } : {}),
    ...(d.price !== undefined ? { price: d.price === "" ? null : d.price } : {}),
    ...(d.paymentStatus !== undefined ? { paymentStatus: d.paymentStatus } : {}),
    ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
  };
}

export function firstIssue(error: z.ZodError) {
  const i = error.issues[0];
  return i ? `${i.path.join(".") || "Value"}: ${i.message}` : "Check the values entered";
}
