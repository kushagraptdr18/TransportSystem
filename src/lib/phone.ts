/**
 * Indian mobile helpers for tel:/wa.me links. A WhatsApp link with a wrong
 * country code silently opens a stranger's chat, so the link only renders for
 * a number that is verifiably an Indian mobile: 10 digits starting 6-9,
 * optionally prefixed 91 / 091 / +91.
 */
export function indianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  if (d.length !== 10 || !/^[6-9]/.test(d)) return null;
  return d;
}

export function waLink(raw: string | null | undefined): string | null {
  const m = indianMobile(raw);
  return m ? `https://wa.me/91${m}` : null;
}
