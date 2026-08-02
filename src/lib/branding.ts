/**
 * URL for a firm's logo or seal.
 *
 * Callers pass the firm row and get back a URL or null — they never touch the
 * storage columns. That is the whole point: when this moves to object storage
 * the signed URL is built here and nothing that renders a logo has to change.
 *
 * The path is fixed and the image is chosen from the session's firm, so the
 * cache buster carries the version instead: without it a re-upload would keep
 * showing the previous image from the browser cache.
 */
export interface BrandingSource {
  logoData?: unknown;
  logoPath?: string | null;
  sealData?: unknown;
  sealPath?: string | null;
  brandingVersion?: number | null;
}

export function firmImageUrl(
  firm: BrandingSource | null | undefined,
  kind: "logo" | "seal"
): string | null {
  if (!firm) return null;
  // a legacy path still counts as "has an image" — the route falls back to the
  // file, and if it has been lost the img simply fails as it does today
  const present =
    kind === "logo" ? firm.logoData || firm.logoPath : firm.sealData || firm.sealPath;
  if (!present) return null;
  return `/api/uploads/firm?kind=${kind}&v=${firm.brandingVersion ?? 0}`;
}
