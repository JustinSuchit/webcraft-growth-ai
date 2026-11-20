import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtTTD = (n: number) => `TT$${Math.round(n).toLocaleString("en-TT")}`;
export const fmtNum = (n: number) => n.toLocaleString("en-US");

export function relTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function ttDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-TT", { timeZone: "America/Port_of_Spain", ...opts }).format(new Date(iso));
}

export const COUNTRY: Record<string, string> = {
  TT: "Trinidad & Tobago", BB: "Barbados", JM: "Jamaica", GY: "Guyana", LC: "Saint Lucia", GD: "Grenada",
  VC: "St Vincent", AG: "Antigua", DM: "Dominica", BS: "Bahamas", KN: "St Kitts & Nevis", SR: "Suriname", BZ: "Belize",
};
export const flag = (cc: string) => cc.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
