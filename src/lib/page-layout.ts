// Shared page widths and spacing for the storefront, so every page lines up with the header.

/** Same width and side margins as the header and footer. */
export const CONTAINER = "mx-auto w-full max-w-[1600px] px-3 sm:px-4";

/** Browsing pages: home, shop, sellers, favourites, product, cart. */
export const PAGE_WIDE = `${CONTAINER} flex-1 py-5`;

/** Reading pages: orders, rewards, order tracking. */
export const PAGE_NARROW = "mx-auto w-full max-w-3xl flex-1 px-3 py-5 sm:px-4";

/** Form pages: sign in, register, checkout. */
export const PAGE_FORM = "mx-auto w-full max-w-lg flex-1 px-3 py-5 sm:px-4";
