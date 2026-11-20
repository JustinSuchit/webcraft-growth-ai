import { Badge } from "@/components/ui";
import { label } from "@/lib/utils";

type Tone = "neutral" | "accent" | "teal" | "sun" | "ok" | "danger";
const TONES: Record<string, Tone> = {
  new: "neutral", researched: "neutral", qualified: "teal", awaiting_approval: "sun", contacted: "teal", replied: "accent",
  interested: "accent", meeting_requested: "accent", proposal_sent: "sun", negotiating: "sun", won: "ok", lost: "neutral",
  do_not_contact: "danger", pending: "sun", approved: "ok", rejected: "danger", revoked: "danger", expired: "neutral", exhausted: "neutral",
  draft: "neutral", scheduled: "teal", publishing: "teal", published: "ok", failed: "danger", cancelled: "neutral", active: "ok",
  paused: "sun", completed: "neutral", succeeded: "ok", running: "teal", queued: "neutral", dead: "danger",
  meeting_request: "accent", quote_request: "accent", question: "teal", not_interested: "neutral", opt_out: "danger",
  out_of_office: "neutral", bounce: "danger", other: "neutral", to_review: "sun", followed_manually: "ok", engaged: "ok", dismissed: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{label(status)}</Badge>;
}
