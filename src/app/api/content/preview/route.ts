import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { TemplateImageProvider } from "@/lib/integrations/image/template";

const Spec = z.object({
  template: z.enum(["headline", "tip", "cta", "before_after", "portfolio"]),
  eyebrow: z.string().max(40).optional(),
  headline: z.string().min(1).max(90),
  body: z.string().max(220).optional(),
  slideNumber: z.number().int().min(1).max(10).optional(),
  slideCount: z.number().int().min(1).max(10).optional(),
});

/** Renders a brand-template slide (local, deterministic, no external calls). Remote images are never accepted here. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("spec") ?? "";
  let spec: z.infer<typeof Spec>;
  try {
    spec = Spec.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    return NextResponse.json({ error: "invalid spec" }, { status: 400 });
  }
  const img = await new TemplateImageProvider().renderSlide({ ...spec, imageUrls: undefined });
  return new NextResponse(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "public, max-age=86400, immutable" } });
}
