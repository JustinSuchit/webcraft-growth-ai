import { Palette } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/app/status";
import { ActionButton } from "@/components/app/action-button";
import { GraphicComposer, SlidePreview } from "@/components/app/graphic-composer";
import { ctx, loadPosts } from "@/lib/data";
import { label, ttDate } from "@/lib/utils";

export const metadata = { title: "Instagram Content Studio" };

export default async function StudioPage() {
  const c = await ctx();
  const posts = await loadPosts(c);
  return (
    <>
      <PageHeader
        title="Instagram Content Studio"
        description="Branded graphics, carousels and Reel storyboards. Every post goes through approval before it can publish."
        actions={<ActionButton demo={c.demo} variant="primary" endpoint="/api/agents/content_creator/run" successText="Planning next week…">Plan next week</ActionButton>}
      />
      <Card className="mb-8">
        <CardHeader title="Graphic composer" description="Live preview of the brand template — rendered on the server exactly as it will be published (1080×1350 JPEG)." />
        <GraphicComposer />
      </Card>

      <h2 className="mb-3 text-sm font-semibold">Posts</h2>
      {posts.length ? (
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="flex snap-x gap-2 overflow-x-auto bg-surface-2/60 p-3">
                {p.slides.map((s, i) => (
                  <div key={i} className="w-44 shrink-0 snap-start"><SlidePreview spec={{ ...s, slideNumber: i + 1, slideCount: p.slides.length > 1 ? p.slides.length : undefined }} /></div>
                ))}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">{label(p.media_type.toLowerCase())}</Badge>
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-muted">{ttDate(p.scheduled_for)}</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm">{p.caption}</p>
                <p className="text-xs text-teal">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>
                {"reel_script" in p && p.reel_script ? (
                  <details className="rounded-lg border border-border p-3 text-xs">
                    <summary className="cursor-pointer font-medium">Reel script & storyboard</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed text-muted">{p.reel_script}</pre>
                    <p className="mt-2 text-sun">Film and upload the video before requesting approval.</p>
                  </details>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={<Palette className="h-5 w-5" />} title="No posts yet" body="Use “Plan next week” and the Content Creator drafts posts with rendered slides for your approval." /></Card>
      )}
    </>
  );
}
