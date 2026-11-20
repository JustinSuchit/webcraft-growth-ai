"use client";
import { useDeferredValue, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui";

interface Spec { template: string; eyebrow?: string; headline: string; body?: string; slideNumber?: number; slideCount?: number }

export function previewUrl(spec: Spec) {
  const json = JSON.stringify(spec);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/api/content/preview?spec=${b64}`;
}

export function SlidePreview({ spec }: { spec: Spec }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={previewUrl(spec)} alt={spec.headline} loading="lazy" className="aspect-[4/5] w-full rounded-lg border border-border bg-surface object-cover" />;
}

export function GraphicComposer() {
  const [spec, setSpec] = useState<Spec>({ template: "headline", eyebrow: "Website check", headline: "Is your website working as hard as you are?", body: "" });
  const deferred = useDeferredValue(spec);
  const set = (k: keyof Spec) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setSpec((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid gap-6 p-5 md:grid-cols-[1fr_260px]">
      <div className="space-y-3 text-sm">
        <label className="block"><span className="text-xs text-muted">Template</span>
          <Select value={spec.template} onChange={set("template")}>
            <option value="headline">Headline (dark)</option><option value="tip">Tip (light)</option><option value="cta">Call to action (dark)</option>
          </Select>
        </label>
        <label className="block"><span className="text-xs text-muted">Eyebrow</span><Input value={spec.eyebrow ?? ""} onChange={set("eyebrow")} maxLength={40} /></label>
        <label className="block"><span className="text-xs text-muted">Headline</span><Input value={spec.headline} onChange={set("headline")} maxLength={90} /></label>
        <label className="block"><span className="text-xs text-muted">Body</span><Textarea value={spec.body ?? ""} onChange={set("body")} maxLength={220} className="min-h-20" /></label>
        <p className="text-[11px] text-muted">Before/after and portfolio templates only accept client work marked as authorised in Settings.</p>
      </div>
      <SlidePreview spec={deferred} />
    </div>
  );
}
