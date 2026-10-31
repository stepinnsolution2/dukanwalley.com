import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCartReminderEmail } from "@/lib/customer-emails";
import { isUnsubscribed, marketingEmailsLeftToday, marketingSettings } from "@/lib/marketing";
import { sendSms } from "@/lib/twilio";
import { NotificationCampaignType } from "@/generated/prisma/enums";

/**
 * Cart reminder series, counted from the cart's last change. A change restarts the series.
 * Stops when the cart is ordered or emptied, the shopper unsubscribes, or after the last step.
 */
const CART_REMINDER_STEPS_HOURS = [2, 24, 72, 168] as const;
/** Per address: at most this many reminders in 14 days, at least 20 hours apart. */
const MAX_PER_EMAIL_14_DAYS = 4;
const MIN_GAP_HOURS = 20;
/** Pakistan time; reminders wait for the morning instead of arriving at night. */
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 21;

const HOUR = 3600_000;

/**
 * Run hourly with header `x-cron-secret: $CRON_SECRET`. Respects Admin › Settings ›
 * Email marketing (on/off and the daily limit shared with newsletters).
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await marketingSettings();
  if (!settings.cartReminders) return NextResponse.json({ skipped: "cart reminders are off" });
  const pkHour = new Date(Date.now() + 5 * HOUR).getUTCHours();
  if (pkHour < SEND_FROM_HOUR || pkHour >= SEND_UNTIL_HOUR) return NextResponse.json({ skipped: "outside 9am–9pm" });
  let left = await marketingEmailsLeftToday();
  if (!left) return NextResponse.json({ skipped: "daily limit reached" });

  const now = Date.now();
  const lastStep = CART_REMINDER_STEPS_HOURS[CART_REMINDER_STEPS_HOURS.length - 1];
  const carts = await prisma.cart.findMany({
    where: {
      // Old enough for the first step, not past the last one (with a day's slack for missed runs).
      updatedAt: { lt: new Date(now - CART_REMINDER_STEPS_HOURS[0] * HOUR), gte: new Date(now - (lastStep + 24) * HOUR) },
      items: { some: {} },
      OR: [{ guestEmail: { not: null } }, { user: { isNot: null } }],
    },
    select: {
      id: true,
      updatedAt: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { email: true, phone: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const summary = { carts: carts.length, sent: 0, failed: 0 };
  for (const cart of carts) {
    if (!left) break;
    const email = cart.user?.email ?? cart.guestEmail;
    if (!email || /\.internal$/i.test(email) || (await isUnsubscribed(email))) continue;

    // Which step is due: steps already sent since the cart last changed.
    const logs = await prisma.notificationCampaignLog.findMany({
      where: { type: NotificationCampaignType.ABANDONED_CART, sentAt: { gte: cart.updatedAt }, payload: { path: ["cartId"], equals: cart.id } },
      select: { id: true },
    });
    const step = logs.length;
    if (step >= CART_REMINDER_STEPS_HOURS.length) continue;
    if (now - cart.updatedAt.getTime() < CART_REMINDER_STEPS_HOURS[step] * HOUR) continue;

    // An order from this cart since it last changed (e.g. an online payment still pending).
    const ordered = await prisma.order.count({ where: { checkoutCartId: cart.id, createdAt: { gte: cart.updatedAt } } });
    if (ordered) continue;

    const recent = await prisma.notificationCampaignLog.findMany({
      where: { type: NotificationCampaignType.ABANDONED_CART, targetEmail: email, sentAt: { gte: new Date(now - 14 * 24 * HOUR) } },
      select: { sentAt: true },
      orderBy: { sentAt: "desc" },
    });
    if (recent.length >= MAX_PER_EMAIL_14_DAYS) continue;
    if (recent[0] && now - recent[0].sentAt.getTime() < MIN_GAP_HOURS * HOUR) continue;

    try {
      if (!(await sendCartReminderEmail(cart.id, email, step))) continue;
      const phone = cart.user?.phone ?? cart.guestPhone;
      if (step === 0 && phone) {
        await sendSms(phone, "You left items in your DukanWalley cart. Complete your order any time: free delivery, cash on delivery.");
      }
    } catch (e) {
      summary.failed += 1;
      console.error("[cart-reminder]", cart.id, e instanceof Error ? e.message : e);
      continue;
    }
    await prisma.notificationCampaignLog.create({
      data: { type: NotificationCampaignType.ABANDONED_CART, targetEmail: email, payload: { cartId: cart.id, step } },
    });
    summary.sent += 1;
    left -= 1;
  }
  return NextResponse.json(summary);
}
