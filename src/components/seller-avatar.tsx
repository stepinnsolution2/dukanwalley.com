import Image from "next/image";
import { canOptimizeImage } from "@/lib/media-url";

/** Round store logo, or the store's initial when it has none. */
export function SellerAvatar({ name, logoUrl, size = 64 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-xl font-semibold text-teal-800"
      style={{ width: size, height: size }}
    >
      {logoUrl ? <Image src={logoUrl} alt="" fill unoptimized={!canOptimizeImage(logoUrl)} className="object-cover" sizes={`${size}px`} /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
