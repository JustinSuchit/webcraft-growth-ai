/** Hand-written row types for the tables the service layer touches most. Regenerate full types with `npm run db:types`. */
export type ProspectStatus =
  | "new" | "researched" | "qualified" | "awaiting_approval" | "contacted" | "replied" | "interested"
  | "meeting_requested" | "proposal_sent" | "negotiating" | "won" | "lost" | "do_not_contact";

export const PROSPECT_STATUSES: { value: ProspectStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "researched", label: "Researched" },
  { value: "qualified", label: "Qualified" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "meeting_requested", label: "Meeting Requested" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

export const INDUSTRIES = [
  "construction", "hardware", "automotive", "retail", "real_estate", "manufacturing",
  "professional_services", "health_fitness", "hospitality", "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const SERVICES = ["website", "redesign", "ecommerce", "custom_system", "seo", "other"] as const;
export type Service = (typeof SERVICES)[number];

export interface Prospect {
  id: string;
  organization_id: string;
  business_name: string;
  country_code: string;
  city: string | null;
  industry: Industry;
  website_url: string | null;
  website_domain: string | null;
  instagram_url: string | null;
  phone: string | null;
  public_email: string | null;
  status: ProspectStatus;
  current_score: number | null;
  confidence: number | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  organization_id: string;
  thread_id: string | null;
  prospect_id: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  direction: "outbound" | "inbound";
  status: "draft" | "awaiting_approval" | "approved" | "sending" | "sent" | "failed" | "cancelled" | "received";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  content_hash: string;
  approval_id: string | null;
  provider_message_id: string | null;
  rfc_message_id: string | null;
  in_reply_to: string | null;
  classification: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  kind: "email_message" | "email_campaign" | "social_post" | "publishing_schedule";
  status: "pending" | "approved" | "rejected" | "revoked" | "expired" | "exhausted";
  title: string;
  summary: string | null;
  target_type: string | null;
  target_id: string | null;
  content_hash: string | null;
  scope: Record<string, unknown>;
  max_uses: number;
  used_count: number;
  expires_at: string;
  requested_by: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  organization_id: string;
  instagram_account_id: string | null;
  media_type: "IMAGE" | "CAROUSEL" | "REELS";
  caption: string;
  hashtags: string[];
  asset_ids: string[];
  reel_script: string | null;
  status: "draft" | "awaiting_approval" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  scheduled_for: string | null;
  content_hash: string;
  approval_id: string | null;
  ig_media_id: string | null;
  permalink: string | null;
  published_at: string | null;
  error: string | null;
}

export interface OrgSettings {
  daily_prospect_target: number;
  posts_per_week: number;
  daily_email_cap: number;
  expansion_countries?: string[];
  posting_slots?: { weekday: number; hour: number }[];
}

export interface SenderIdentityRow {
  legalName?: string;
  senderName?: string;
  postalAddress?: string;
  website?: string;
  replyTo?: string;
}
