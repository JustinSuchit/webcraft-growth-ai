/**
 * The only facts agents may state about WebCraft TT. Edit this file (or the org's
 * sender_identity) to change them — agents are instructed not to claim anything else
 * (no invented client counts, awards, results or testimonials).
 */
export const WEBCRAFT_PROFILE = {
  name: "WebCraft TT",
  description: "a web development and custom software business based in Trinidad and Tobago.",
  services: {
    website: "New business websites — fast, mobile-first, easy to update",
    redesign: "Redesign of outdated or non-mobile websites",
    ecommerce: "Online stores and ordering, with local and international payment options",
    custom_system: "Custom business systems: booking, quoting, inventory, client portals, internal tools",
    seo: "Search visibility: technical SEO, Google Business Profile, local search",
    other: "Related digital services discussed case by case",
  },
  tone: "Warm, direct, professional Caribbean English. Specific, never pushy. No hype.",
} as const;
