// Pure URL checks for stored media; safe to import from client components (storage.ts uses fs).

/** A file uploaded here and served by /api/media (e.g. /api/media/image/202610/abc.jpg). */
export function isStoredMediaUrl(url: string) {
  return /^\/api\/media\/[a-z]+\/\d{6}\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(url);
}

/**
 * Whether next/image may resize this src. Our uploads can be optimized; vendors may also paste
 * any https image URL, which the optimizer would reject (not in images.remotePatterns), so
 * those are shown as-is.
 */
export function canOptimizeImage(url: string) {
  return isStoredMediaUrl(url);
}
