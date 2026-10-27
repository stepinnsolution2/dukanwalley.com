// Staff permission table. Pure data: safe to import from client components to hide controls.
// The server enforces the same table in src/lib/authz.ts.

export const STAFF_ROLES = ["SUPER_ADMIN", "SUBADMIN", "ASSISTANT"] as const;

const ALL_STAFF = STAFF_ROLES;
const OPERATIONS = ["SUPER_ADMIN", "SUBADMIN"] as const;
const OWNER = ["SUPER_ADMIN"] as const;

const GRANTS = {
  "dashboard:view": ALL_STAFF,
  "orders:view": ALL_STAFF,
  "orders:manage": OPERATIONS, // COD confirmation, ship / deliver / return
  "orders:override": OWNER, // set any status manually (no side effects), with a reason
  "reports:view": ALL_STAFF,
  "live:view": ALL_STAFF,
  "products:view": ALL_STAFF,
  "products:review": OPERATIONS,
  "products:edit": OPERATIONS,
  "products:import": OPERATIONS, // supplier file imports (land in Pending review)
  "catalog:manage": OPERATIONS, // categories and their product attributes
  "vendors:view": OPERATIONS,
  "vendors:manage": OPERATIONS, // create vendors, KYC status, verification notes
  "vendors:restrict": OWNER, // suspend selling / payouts
  "vendors:commission": OWNER,
  "newsletter:view": OPERATIONS,
  "newsletter:manage": OPERATIONS,
  "sales-team:manage": OWNER,
  "settings:manage": OWNER, // payment gateway and email credentials
  "banners:manage": OPERATIONS, // home page hero banners
  "content:manage": OPERATIONS, // info pages (About, policies) and blog posts
  "ads:manage": OWNER, // paid advertising: companies, bookings, prices, reports
} as const satisfies Record<string, readonly string[]>;

export type Permission = keyof typeof GRANTS;

export function isStaff(role: string | undefined | null) {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

export function can(role: string | undefined | null, permission: Permission) {
  return (GRANTS[permission] as readonly string[]).includes(role ?? "");
}
