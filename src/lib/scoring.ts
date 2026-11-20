/**
 * Lead scoring v1 — deterministic and explainable.
 * Claude proposes component scores from evidence; this function applies the weights,
 * caps components that lack verified evidence, and produces the 0–100 score stored in lead_scores.
 */
export interface ScoreComponents {
  serviceFit: number;      // how well WebCraft TT's services match what they need
  verifiedNeed: number;    // need backed by observed evidence (site audit, no site, no e-commerce, ...)
  contactQuality: number;  // named decision-maker email > generic inbox > contact form only
  engagement: number;      // replies, opens of conversation, social interaction with us
  buyingIntent: number;    // explicit signals: asked for quote/meeting, hiring web roles, launching
}

export const WEIGHTS: Record<keyof ScoreComponents, number> = {
  serviceFit: 0.3,
  verifiedNeed: 0.25,
  contactQuality: 0.15,
  engagement: 0.15,
  buyingIntent: 0.15,
};

export interface ScoreInput extends ScoreComponents {
  evidenceCount: number;       // verified evidence URLs
  hasDeliverableContact: boolean;
  suppressed: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeLeadScore(input: ScoreInput): { score: number; components: ScoreComponents; notes: string[] } {
  const notes: string[] = [];
  const c: ScoreComponents = {
    serviceFit: clamp(input.serviceFit),
    verifiedNeed: clamp(input.verifiedNeed),
    contactQuality: clamp(input.contactQuality),
    engagement: clamp(input.engagement),
    buyingIntent: clamp(input.buyingIntent),
  };
  if (input.evidenceCount === 0 && c.verifiedNeed > 30) {
    c.verifiedNeed = 30;
    notes.push("Verified need capped at 30: no verified evidence URLs.");
  }
  if (!input.hasDeliverableContact && c.contactQuality > 20) {
    c.contactQuality = 20;
    notes.push("Contact quality capped at 20: no deliverable public contact.");
  }
  let score = clamp(
    (Object.keys(WEIGHTS) as (keyof ScoreComponents)[]).reduce((sum, k) => sum + c[k] * WEIGHTS[k], 0),
  );
  if (input.suppressed) {
    score = 0;
    notes.push("Score set to 0: contact is suppressed / do not contact.");
  }
  return { score, components: c, notes };
}

export function scoreBand(score: number | null | undefined): "hot" | "warm" | "cool" | "unscored" {
  if (score == null) return "unscored";
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  return "cool";
}
