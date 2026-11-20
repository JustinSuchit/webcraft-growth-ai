/**
 * DEMO MODE SAMPLE DATA — fictional businesses on the reserved `.example` domain.
 * Shown only when Supabase is not configured, always under a "Demo mode" banner.
 * Nothing here describes a real company, and no action taken in demo mode reaches the outside world.
 */
import type { ProspectStatus, Industry } from "@/lib/db/types";

const DAY = 86400_000;
const now = Date.UTC(2026, 10, 20, 13, 0, 0);
const ago = (d: number) => new Date(now - d * DAY).toISOString();
const ahead = (d: number) => new Date(now + d * DAY).toISOString();

export interface DemoProspect {
  id: string; business_name: string; country_code: string; city: string; industry: Industry;
  website_url: string | null; instagram_url: string | null; public_email: string | null; status: ProspectStatus;
  current_score: number; confidence: number; next_follow_up_at: string | null; created_at: string;
  summary: string; opportunities: { service: string; rationale: string; evidence_url: string }[];
  observations: Record<string, unknown>;
}

const p = (
  i: number, name: string, cc: string, city: string, industry: Industry, status: ProspectStatus, score: number,
  site: boolean, summary: string, opps: [string, string][], follow?: number,
): DemoProspect => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "");
  return {
    id: `demo-p${i}`, business_name: `${name} (sample)`, country_code: cc, city, industry,
    website_url: site ? `https://${slug}.example` : null, instagram_url: `https://www.instagram.com/${slug}.example/`,
    public_email: `hello@${slug}.example`, status, current_score: score, confidence: 0.6 + (score % 30) / 100,
    next_follow_up_at: follow !== undefined ? ahead(follow) : null, created_at: ago(i % 9), summary,
    opportunities: opps.map(([service, rationale]) => ({ service, rationale, evidence_url: `https://${slug}.example/` })),
    observations: site
      ? { fetched: true, https: score % 2 === 0, hasViewportMeta: score > 60, copyrightYear: 2017 + (score % 6), responseMs: 900 + score * 20 }
      : { fetched: false, skippedReason: "no_website" },
  };
};

export const demoProspects: DemoProspect[] = [
  p(1, "Coral Reef Hardware", "TT", "Chaguanas", "hardware", "meeting_requested", 88, true, "Family hardware store with three branches; site lists no product catalogue.", [["ecommerce", "No online catalogue or ordering; customers phone for stock checks."], ["seo", "Branch pages missing from search."]], 1),
  p(2, "Savannah Fitness Studio", "TT", "Port of Spain", "health_fitness", "interested", 81, true, "Boutique gym; class booking via DM only.", [["custom_system", "Bookings handled through Instagram DMs; no scheduling system."]], 2),
  p(3, "Northern Range Builders", "TT", "Arima", "construction", "contacted", 74, true, "Contractor with a 2018-era site that is not mobile friendly.", [["redesign", "No viewport meta tag; layout breaks on phones."]], 4),
  p(4, "Bajan Breeze Villas", "BB", "Holetown", "hospitality", "awaiting_approval", 72, true, "Villa rentals relying on third-party booking sites.", [["website", "Direct-booking page would cut commission fees."]]),
  p(5, "Kingston Auto Parts Hub", "JM", "Kingston", "automotive", "qualified", 69, false, "Parts dealer with Facebook page only.", [["website", "No website found; Facebook is the only presence."]]),
  p(6, "Tobago Dive & Sail", "TT", "Crown Point", "hospitality", "replied", 66, true, "Tour operator; booking form is a PDF download.", [["custom_system", "PDF booking form; no online payment."]], 3),
  p(7, "Demerara Trade Supplies", "GY", "Georgetown", "retail", "qualified", 63, true, "Wholesale supplier; price list is a scanned image.", [["ecommerce", "Price list published as an image; no ordering."]]),
  p(8, "St. Lucia Legal Partners", "LC", "Castries", "professional_services", "researched", 58, true, "Law practice; site has no HTTPS.", [["redesign", "Site served without HTTPS."]]),
  p(9, "Grenada Spice Market", "GD", "St. George's", "retail", "proposal_sent", 84, true, "Spice exporter planning online sales.", [["ecommerce", "Announced plans to sell internationally."]], 5),
  p(10, "Couva Steel Fabricators", "TT", "Couva", "manufacturing", "new", 41, false, "Fabrication shop listed in a trade directory.", [["website", "No website found."]]),
  p(11, "Maraval Realty Group", "TT", "Maraval", "real_estate", "negotiating", 90, true, "Agency with listings only on Facebook.", [["custom_system", "Listings managed manually across social posts."]], 1),
  p(12, "San Fernando Dental Care", "TT", "San Fernando", "health_fitness", "won", 92, true, "Dental clinic; new site launched.", [["redesign", "Previous site outdated."]]),
  p(13, "Montego Bay Event Rentals", "JM", "Montego Bay", "hospitality", "lost", 35, true, "Chose an in-house build.", [["website", "Outdated gallery site."]]),
  p(14, "Point Fortin Motors", "TT", "Point Fortin", "automotive", "do_not_contact", 0, true, "Asked not to be contacted.", [["redesign", "—"]]),
];

export const demoApprovals = [
  { id: "demo-a1", kind: "email_message", status: "pending", title: "Email to hello@bajanbreezevillas.example", summary: "Direct bookings for Bajan Breeze Villas", requested_by: "agent:sales_rep", created_at: ago(0.2), expires_at: ahead(14), max_uses: 1, used_count: 0,
    body: "Hi Bajan Breeze team,\n\nI noticed your villas are booked mainly through third-party sites. A simple direct-booking page on your own website could let returning guests book with you directly and save on commission.\n\nWould a 15-minute call next week be useful? Happy to share a couple of ideas either way.\n\nBest regards" },
  { id: "demo-a2", kind: "email_campaign", status: "pending", title: "Campaign: T&T Hardware & Building Supplies", summary: "12 recipients · max 12 emails · 6/day", requested_by: "user:demo", created_at: ago(0.5), expires_at: ahead(30), max_uses: 12, used_count: 0, body: null },
  { id: "demo-a3", kind: "social_post", status: "pending", title: "Instagram post", summary: "5 signs your website is costing you customers 📱", requested_by: "agent:content_creator", created_at: ago(1), expires_at: ahead(7), max_uses: 1, used_count: 0, body: null },
  { id: "demo-a4", kind: "email_message", status: "approved", title: "Email to hello@northernrangebuilders.example", summary: "A mobile-friendly site for Northern Range Builders", requested_by: "agent:sales_rep", created_at: ago(3), expires_at: ahead(11), max_uses: 1, used_count: 1, body: null },
];

export const demoCampaigns = [
  { id: "demo-c1", name: "T&T Hardware & Building Supplies", status: "awaiting_approval", services: ["ecommerce", "seo"], daily_cap: 6, total_cap: 12, sent: 0, replies: 0, created_at: ago(1) },
  { id: "demo-c2", name: "Caribbean Hospitality — Direct Booking", status: "active", services: ["website", "custom_system"], daily_cap: 10, total_cap: 40, sent: 23, replies: 5, created_at: ago(18) },
  { id: "demo-c3", name: "Fitness Studios Booking Systems", status: "completed", services: ["custom_system"], daily_cap: 8, total_cap: 20, sent: 20, replies: 6, created_at: ago(40) },
];

export const demoThreads = [
  { id: "demo-t1", prospect: "Coral Reef Hardware (sample)", subject: "Online catalogue for Coral Reef Hardware", classification: "meeting_request", needs_attention: true, last_message_at: ago(0.1),
    messages: [
      { direction: "outbound", from: "sales@webcraft.example", body: "Hi team — customers currently phone each branch to check stock. A searchable online catalogue could save your staff those calls…", at: ago(4) },
      { direction: "inbound", from: "manager@coralreefhardware.example", body: "Thanks for reaching out. We have been talking about this. Can we meet Tuesday afternoon?", at: ago(0.1) },
    ],
    draft: "Tuesday works well. Would 2:00pm at your Chaguanas branch suit, or would you prefer a video call? I'll bring a few examples of catalogue layouts for hardware stores." },
  { id: "demo-t2", prospect: "Savannah Fitness Studio (sample)", subject: "Class bookings without the DMs", classification: "interested", needs_attention: true, last_message_at: ago(0.6),
    messages: [
      { direction: "outbound", from: "sales@webcraft.example", body: "Hi Savannah team — I saw bookings are handled through Instagram DMs…", at: ago(5) },
      { direction: "inbound", from: "info@savannahfitness.example", body: "This is interesting. What would something like that cost roughly?", at: ago(0.6) },
    ],
    draft: "Great question — it depends on whether you need payments and memberships built in. A 20-minute call would let me give you an accurate range. Does Thursday morning work?" },
  { id: "demo-t3", prospect: "Tobago Dive & Sail (sample)", subject: "Online bookings for Tobago Dive & Sail", classification: "question", needs_attention: false, last_message_at: ago(2), messages: [], draft: null },
  { id: "demo-t4", prospect: "Point Fortin Motors (sample)", subject: "A refreshed site for Point Fortin Motors", classification: "opt_out", needs_attention: false, last_message_at: ago(6), messages: [], draft: null },
];

export const demoOpportunities = [
  { id: "demo-o1", prospect: "Maraval Realty Group (sample)", title: "Listings portal", service: "custom_system", stage: "negotiating", value_ttd: 68000, probability: 70 },
  { id: "demo-o2", prospect: "Grenada Spice Market (sample)", title: "International online store", service: "ecommerce", stage: "proposal_sent", value_ttd: 45000, probability: 50 },
  { id: "demo-o3", prospect: "Coral Reef Hardware (sample)", title: "Catalogue + click & collect", service: "ecommerce", stage: "meeting_requested", value_ttd: 52000, probability: 35 },
  { id: "demo-o4", prospect: "Savannah Fitness Studio (sample)", title: "Class booking system", service: "custom_system", stage: "interested", value_ttd: 24000, probability: 25 },
  { id: "demo-o5", prospect: "San Fernando Dental Care (sample)", title: "Website redesign", service: "redesign", stage: "won", value_ttd: 18500, probability: 100 },
];

export const demoPosts = [
  { id: "demo-s1", media_type: "CAROUSEL", status: "awaiting_approval", scheduled_for: ahead(3), caption: "5 signs your website is costing you customers 📱\n\nMost Caribbean customers find you on their phone first. If your site is slow, hard to tap, or still says © 2017, they're gone before they call.", hashtags: ["TrinidadBusiness", "SmallBusinessTT", "WebDesign", "CaribbeanBusiness", "MobileFirst"],
    slides: [{ template: "headline", eyebrow: "Website check", headline: "5 signs your website is costing you customers" }, { template: "tip", eyebrow: "Sign 1", headline: "It takes more than 3 seconds to load", body: "Most visitors on mobile data won't wait." }, { template: "tip", eyebrow: "Sign 2", headline: "Buttons are too small to tap", body: "If customers pinch and zoom, they leave." }, { template: "cta", headline: "Want a free 5-minute website check?", body: "DM us “CHECK” or tap the link in bio." }] },
  { id: "demo-s2", media_type: "IMAGE", status: "approved", scheduled_for: ahead(1), caption: "Your Google Business Profile is free advertising. Is yours up to date? 📍", hashtags: ["LocalSEO", "TrinidadAndTobago", "GoogleBusinessProfile"],
    slides: [{ template: "headline", eyebrow: "Local search", headline: "Your Google profile is free advertising" }] },
  { id: "demo-s3", media_type: "REELS", status: "draft", scheduled_for: ahead(5), caption: "From WhatsApp orders to an online store in 30 seconds ⚡", hashtags: ["Ecommerce", "CaribbeanEntrepreneurs"],
    slides: [{ template: "headline", eyebrow: "Reel · storyboard", headline: "From WhatsApp orders to an online store" }], reel_script: "HOOK (0–3s): On-screen: “Still taking orders on WhatsApp?”\nSCENE 1 (3–10s): Phone buzzing with order messages. VO: “Every order means typing, checking stock, sending bank details…”\nSCENE 2 (10–22s): Screen recording of a clean product page and checkout. VO: “An online store does that for you — day and night.”\nCTA (22–30s): “DM us STORE for a free walkthrough.”" },
  { id: "demo-s4", media_type: "IMAGE", status: "published", scheduled_for: ago(2), caption: "Behind the scenes: sketching a booking flow for a fitness studio ✏️", hashtags: ["BehindTheScenes", "WebDevelopment"], slides: [{ template: "headline", eyebrow: "Behind the scenes", headline: "Every great site starts on paper" }], permalink: null },
];

export const demoIgProspects = [
  { id: "demo-i1", username: "sample_port_of_spain_eats", display_name: "POS Eats (sample)", category: "community", followers_count: 18400, country_code: "TT", reason: "Large local food community; owners of restaurants comment often.", suggested_engagement: "Comment with a genuine tip on their next 'new opening' post.", review_status: "to_review", data_source: "business_discovery" },
  { id: "demo-i2", username: "sample_tt_small_biz_network", display_name: "TT Small Biz Network (sample)", category: "collaborator", followers_count: 9200, country_code: "TT", reason: "Runs monthly entrepreneur meetups.", suggested_engagement: "Offer a free 'websites that sell' talk for a meetup.", review_status: "to_review", data_source: "business_discovery" },
  { id: "demo-i3", username: "sample_barbados_villas", display_name: "Barbados Villas (sample)", category: "potential_client", followers_count: 3100, country_code: "BB", reason: "Posts listings but bio links to a third-party booking site.", suggested_engagement: "Follow and engage with their listing posts before any outreach.", review_status: "followed_manually", data_source: "web_research" },
  { id: "demo-i4", username: "sample_caribbean_tech_news", display_name: "Caribbean Tech News (sample)", category: "media", followers_count: 22800, country_code: "JM", reason: "Features regional tech businesses.", suggested_engagement: "Share a case study pitch once a real project is live.", review_status: "to_review", data_source: "business_discovery" },
];

export const demoRecommendations = [
  { type: "content_topic", title: "Answer pricing questions openly", detail: "Replies show prospects ask 'what does a website cost?' — a carousel on what drives cost (pages, payments, bookings) builds trust." },
  { type: "collaboration", title: "Co-host a Live with a local business network", detail: "A 20-minute Instagram Live on 'getting found on Google' reaches owners who already follow small-business accounts." },
  { type: "posting_improvement", title: "Post at 6pm on weekdays", detail: "Your reach is highest on posts published in the early evening TT time." },
];

export const demoMetrics = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(now - (29 - i) * DAY);
  const base = 1200 + i * 28;
  return {
    day: d.toISOString().slice(0, 10),
    followers: 1460 + Math.round(i * 6.3),
    reach: Math.round(base + Math.sin(i / 2) * 300),
    views: Math.round(base * 1.8 + Math.cos(i / 3) * 420),
    interactions: Math.round(60 + i * 2 + Math.sin(i) * 18),
    link_taps: Math.round(6 + (i % 5)),
    emails_sent: [0, 6].includes(d.getUTCDay()) ? 0 : 4 + (i % 4),
    replies: i % 3 === 0 ? 1 : i % 7 === 0 ? 2 : 0,
  };
});

export const demoRuns = [
  { id: "demo-r1", agent: "Lead Discovery", status: "succeeded", trigger: "schedule", summary: "10 saved · 3 discarded (no verifiable evidence) · 28 searches", cost_usd: 0.61, started_at: ago(0.25), duration_s: 212 },
  { id: "demo-r2", agent: "Sales Representative", status: "succeeded", trigger: "event", summary: "Drafted email for Bajan Breeze Villas → approval requested", cost_usd: 0.03, started_at: ago(0.2), duration_s: 14 },
  { id: "demo-r3", agent: "CRM Manager", status: "succeeded", trigger: "schedule", summary: "Daily brief: 2 hot replies, 4 follow-ups due", cost_usd: 0.004, started_at: ago(0.21), duration_s: 6 },
  { id: "demo-r4", agent: "Instagram Content Creator", status: "succeeded", trigger: "schedule", summary: "4 posts planned, 11 slides rendered, 3 approvals requested", cost_usd: 0.09, started_at: ago(1), duration_s: 48 },
  { id: "demo-r5", agent: "Instagram Growth Strategist", status: "failed", trigger: "manual", summary: "Meta not connected — Business Discovery verification unavailable", cost_usd: 0.12, started_at: ago(3), duration_s: 63 },
];

export const demoTasks = [
  { id: "demo-k1", title: "Confirm Tuesday meeting — Coral Reef Hardware", kind: "meeting", due_at: ahead(0.2) },
  { id: "demo-k2", title: "Send pricing ranges — Savannah Fitness", kind: "quote", due_at: ahead(0.5) },
  { id: "demo-k3", title: "Check for reply — Northern Range Builders", kind: "follow_up", due_at: ahead(1) },
  { id: "demo-k4", title: "Proposal follow-up — Grenada Spice Market", kind: "follow_up", due_at: ahead(2) },
];
