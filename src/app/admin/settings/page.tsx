import { requirePagePermission } from "@/lib/authz";
import { INTEGRATION_GROUPS } from "@/lib/integration-fields";
import { integrationSettingsForAdmin } from "@/lib/integration-settings";
import { PAYMENT_METHOD_LABELS } from "@/lib/markets";
import { availablePaymentMethods } from "@/lib/payments";
import { SITE_URL } from "@/lib/seo";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePagePermission("settings:manage");
  const [status, pkMethods] = await Promise.all([integrationSettingsForAdmin(), availablePaymentMethods("PK")]);
  const configured = Object.fromEntries(
    INTEGRATION_GROUPS.map((g) => [g.id, g.required.every((k) => status[k]?.inAdmin || status[k]?.inEnv)]),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Payment gateways and email. A method appears at checkout as soon as its details are saved here.
          Passwords and keys are stored encrypted and are never shown again.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-semibold text-zinc-900">Checkout in Pakistan currently offers</h2>
        <p className="mt-1 text-zinc-700">{pkMethods.map((m) => PAYMENT_METHOD_LABELS[m]).join(" · ")}</p>
        <h3 className="mt-3 font-medium text-zinc-900">Addresses to give JazzCash and Easypaisa</h3>
        <dl className="mt-1 grid gap-1 text-zinc-700 sm:grid-cols-[12rem_1fr]">
          <dt>JazzCash return URL</dt>
          <dd className="break-all font-mono text-xs">{SITE_URL}/api/payments/jazzcash/return</dd>
          <dt>Easypaisa IPN URL</dt>
          <dd className="break-all font-mono text-xs">{SITE_URL}/api/payments/easypaisa/ipn</dd>
        </dl>
      </section>

      <SettingsForm groups={INTEGRATION_GROUPS} status={status} configured={configured} />
    </div>
  );
}
