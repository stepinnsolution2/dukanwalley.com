import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { broadcastAdmin } from "@/lib/realtime";

export async function notifyUserChannels(opts: {
  email?: string | null;
  phone?: string | null;
  subject: string;
  message: string;
}) {
  const tasks: Promise<unknown>[] = [];
  if (opts.email) {
    tasks.push(
      sendEmail({
        to: opts.email,
        subject: opts.subject,
        text: opts.message,
      }),
    );
  }
  if (opts.phone) {
    tasks.push(sendSms(opts.phone, opts.message));
  }
  await Promise.all(tasks);
}

export async function alertCompanyOrderSummary(summary: string) {
  const email = process.env.COMPANY_NOTIFY_EMAIL;
  const phone = process.env.COMPANY_NOTIFY_PHONE;
  await notifyUserChannels({
    email,
    phone,
    subject: "New marketplace order",
    message: summary,
  });
  await broadcastAdmin("order:new", { summary });
}

export async function notifyVendorSkuSold(opts: {
  vendorEmail?: string | null;
  vendorPhone?: string | null;
  storeName: string;
  productName: string;
  orderNumber: string;
}) {
  const msg = `Sale: "${opts.productName}" from ${opts.storeName}. Order ${opts.orderNumber}.`;
  await notifyUserChannels({
    email: opts.vendorEmail,
    phone: opts.vendorPhone,
    subject: `New sale — ${opts.storeName}`,
    message: msg,
  });
}

export async function notifyBuyerOrder(opts: {
  email: string;
  phone?: string | null;
  orderNumber: string;
  total: string;
}) {
  await notifyUserChannels({
    email: opts.email,
    phone: opts.phone,
    subject: `Order confirmed ${opts.orderNumber}`,
    message: `Thanks for your order ${opts.orderNumber}. Total ${opts.total}.`,
  });
}
