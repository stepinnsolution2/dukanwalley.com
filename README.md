# Marketplace

Multi-vendor marketplace on Next.js 16 (App Router), Prisma 7 + PostgreSQL, and Auth.js v5.
Vendors sell through the platform; an in-house sales team lists products for them; staff
approve every listing; the platform takes a commission recorded in a double-entry ledger.

## Setup

```bash
cp .env.example .env        # then fill in DATABASE_URL and AUTH_SECRET at minimum
npm install
npm run db:migrate          # apply migrations
npm run db:seed             # demo data
npm run dev:all             # Next.js on :3000 + Socket.IO realtime server on :3001
```

Seeded accounts (password `Password123!`), all `@marketplace.dev`: `owner` (super admin),
`ops` (subadmin), `assistant`, `sales`, `vendor` (Pakistan store), `vendor-uae` (UAE store),
and `buyer`. Re-running the seed resets the demo products' prices.

Email (SMTP) and SMS (Twilio) log to the console when their credentials are unset.

## Markets: Pakistan and the UAE

All country rules live in `src/lib/markets.ts` (currency, provinces/emirates, mobile
format, payment methods, ID labels).

- Every vendor belongs to one market (`PK` or `AE`) and prices in its currency: **PKR in
  whole rupees**, **AED with fils**.
- Shoppers pick a market with the header switcher (`mp_market` cookie, default `PK`) and
  see only that market's catalog. A cart holds one market's products; there is no
  cross-border selling yet.
- **Prices include tax.** `Product.salesTaxBps` is the sales tax (PK) or VAT (AE) rate
  already inside `basePrice`; checkout splits it out rather than adding it on top. In PK the
  included tax is rounded to whole rupees.
- **Tax is optional per vendor.** Only vendors with a `taxRegNo` (STRN / TRN) charge tax;
  for others the rate must be 0 (enforced on product create/edit) and checkout applies 0
  even if a rate was set earlier.
- Checkout requires a local mobile number (stored as `+92…` / `+971…`) and a
  province/emirate; postal code is optional.
- Vendor KYC fields: CNIC / NTN / STRN in Pakistan, Emirates ID / trade licence / TRN in
  the UAE (`nationalId`, `businessRegNo`, `taxRegNo`).

## Catalog

- **Uploads:** sales staff and catalog editors upload product images (JPEG/PNG/WebP/GIF,
  10 MB) and videos (MP4/MOV/WebM, 200 MB) via `POST /api/uploads`. Files are checked by
  their content (not the claimed type; SVG is refused), stored under `UPLOAD_DIR`, and served
  from `/api/media/…` with range support for video. See `src/lib/storage.ts`.
- **Category fields:** Admin → Categories manages the category tree and each category's
  product fields (text, number, yes/no, list; optionally required), e.g. Size for Shoes.
  Product forms render them; values are validated on save and stored in `Product.metadata`.
- **Review loop:** sales submit → staff review (full details, media, fields) → approve (show
  on storefront / for sale) or reject with a reason → the salesperson sees the reason and a
  notification, edits media/details and resubmits. Staff can edit any product and hide,
  show, stop or start selling in bulk.
- **Who can sell:** only KYC-approved vendors that aren't suspended from selling
  (`SUSPEND_PAYOUTS` still sells). Enforced on the storefront, cart and checkout.

## Orders

Lifecycle: `PLACED` (COD awaiting confirmation) / `PENDING_PAYMENT` → `CONFIRMED` / `PAID`
→ `PROCESSING` → `SHIPPED` (courier + tracking) → `DELIVERED` → `RETURNED`. Staff drive it
from Admin → Orders → order page. Cancelling or returning a COD order returns stock and
reverses its ledger entries; returning a prepaid order returns stock and raises a
`REFUND_NEEDED` flag (refunds are not automated yet). Every change is recorded in
`OrderEvent` with who made it; the super admin can override a status with a reason. The
buyer is emailed/texted on shipped, delivered, returned and cancelled.

Customers see their orders at `/account/orders`; anyone can track an order at
`/orders/track` with the order number plus the checkout email or mobile.

Newsletter signup is in the storefront footer; Admin → Newsletter filters, unsubscribes
and exports CSV.

## Areas

| Path | Role | Purpose |
|---|---|---|
| `/`, `/products`, `/cart`, `/checkout` | anyone | storefront; guests shop with a cookie cart that merges into their account on login |
| `/sales` | `SALES` | create/edit listings for a vendor; every edit goes back to review |
| `/admin` | staff (see below) | review products, manage vendors, orders, reports, live order feed |
| `/vendor` | `VENDOR` | store status and products; self-registration at `/vendor/register` |

### Staff permissions

Defined in `src/lib/permissions.ts`, enforced by every admin API route (`requirePermission`
in `src/lib/authz.ts`) and every admin section's `layout.tsx`; the admin menu hides what a
role can't open.

| | Super admin | Subadmin | Assistant |
|---|---|---|---|
| Overview, orders, reports, products (view), live feed | ✓ | ✓ | ✓ |
| Confirm/cancel COD orders; ship, deliver, return | ✓ | ✓ | |
| Manual order status override | ✓ | | |
| Approve/reject/edit products; bulk hide/show | ✓ | ✓ | |
| Categories and their product fields | ✓ | ✓ | |
| Vendors: view, create, KYC | ✓ | ✓ | |
| Newsletter | ✓ | ✓ | |
| Vendor restrictions (suspend selling/payouts) | ✓ | | |
| Commission overrides | ✓ | | |
| Sales team accounts | ✓ | | |

## Payments

| | Pakistan | UAE |
|---|---|---|
| Cash on delivery (with buyer confirmation) | ✓ | ✓ |
| JazzCash wallet | ✓ when `JAZZCASH_*` is set | — |
| Easypaisa account | ✓ when `EASYPAISA_*` is set | — |
| Debit/credit card | via JazzCash (or Easypaisa: `PK_CARD_GATEWAY`) | Stripe Checkout (AED) |

A method only appears at checkout when its gateway is configured (`src/lib/payments/`).
Every online payment follows the same shape: the order is created as `PENDING_PAYMENT`
with stock reserved (cart kept), the buyer is sent to the gateway's hosted page, and the
order becomes `PAID` (ledger booked, cart emptied) only on a verified result. Failed or
abandoned payments are cancelled and their stock returned. A payment that arrives after
cancellation creates a `PAID_AFTER_CANCEL` risk flag for a manual refund.

- **JazzCash** (page redirection, integration guide v4.2) — signed form post; the result is
  posted to `/api/payments/jazzcash/return` and its `pp_SecureHash` (HMAC-SHA256 with the
  integrity salt) and amount are verified. Register that return URL with JazzCash. Set
  `JAZZCASH_INQUIRY_URL` (issued by JazzCash) so lost callbacks can be resolved.
- **Easypaisa** (Easypay hosted checkout) — AES-encrypted request to `Index.jsf`, token
  hand-off at `/api/payments/easypaisa/token` to `Confirm.jsf`, return at
  `/api/payments/easypaisa/return`. The return isn't signed, so payment is always verified
  with the inquire-transaction API; configure the IPN URL `/api/payments/easypaisa/ipn`.
- **Stripe (UAE)** — Checkout session; only the webhook marks it paid (see below).

Gateway integrations were built from the providers' integration guides and tested against
local stand-ins; test each one in its sandbox with your merchant credentials before going live.

### Cash on delivery confirmation

A COD order starts as `PLACED` (stock reserved, nothing booked). The buyer receives a
link — WhatsApp via Twilio (template `TWILIO_WHATSAPP_COD_CONTENT_SID`), falling back to
SMS if WhatsApp isn't configured, is rejected, or Twilio later reports it undelivered — plus
email. Opening `/orders/confirm/<token>` only shows the order (link previews are safe); the
buyer taps **Confirm** or **Cancel**. Confirmation moves it to `CONFIRMED`, books the
ledger and notifies the vendor. Staff can confirm, cancel or resend from **Admin → Orders**
after calling the buyer. Unconfirmed orders are cancelled after `COD_CONFIRM_TTL_HOURS`
(default 48). Set the Twilio status callback handling at `/api/webhooks/twilio/status`
(signed requests only; the app sets the callback URL per message).

### Stripe webhook

- **Card (Stripe Checkout)** — requires `STRIPE_SECRET_KEY`. The order is created as
  `PENDING_PAYMENT` with stock reserved, and the buyer is redirected to Stripe. Only the
  webhook at `/api/webhooks/stripe` marks it `PAID` (and books the ledger). If the session
  expires (30 minutes), the order is cancelled and stock returned.

  Point a Stripe webhook at `/api/webhooks/stripe` with events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, and set
  `STRIPE_WEBHOOK_SECRET`. Locally:
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- PayPal and Tabby exist in the schema but are not integrated, so checkout rejects them.

## Commission and ledger

Commission (basis points, 1000 = 10%) resolves most-specific first: vendor rule → vendor
`commissionOverrideBps` → category rule → global rule → `GLOBAL_COMMISSION_BPS` setting → 10%.
It is charged on the amount excluding tax. Each order line records `SALE_NET_TO_VENDOR`,
`PLATFORM_COMMISSION`, and `SALES_TAX_TO_VENDOR` movements in the order's currency (see
`src/lib/ledger.ts`); the vendor is the tax-registered seller and receives the tax.
Revenue and commission are always reported per market/currency, never summed across them.

## Jobs

Both take header `x-cron-secret: $CRON_SECRET`:

- `POST /api/cron/expire-orders` — **every 10–15 minutes.** Asks the gateway about online
  payments older than 45 minutes (marks paid or cancels; gives up after 24h) and cancels
  COD orders past their confirmation deadline.
- `POST /api/cron/abandoned-cart` — daily; reminders for stale carts.
