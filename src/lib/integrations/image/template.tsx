import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BRAND, type GeneratedImage, type ImageProvider, type SlideSpec } from "./types";

/**
 * Deterministic branded graphics rendered from JSX (no AI image model, no garbled text,
 * zero marginal cost). Output is JPEG because the Instagram API only accepts JPEG images.
 */
const FONT_DIR = path.join(process.cwd(), "src/lib/integrations/image/fonts");
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700 | 900; style: "normal" }[]> | undefined;
const loadFonts = () =>
  (fonts ??= Promise.all(
    ([["Regular", 400], ["Bold", 700], ["Black", 900]] as const).map(async ([file, weight]) => ({
      name: "Geist", data: await readFile(path.join(FONT_DIR, `Geist-${file}.ttf`)), weight, style: "normal" as const,
    })),
  ));

export class TemplateImageProvider implements ImageProvider {
  readonly name = "template";

  async renderSlide(spec: SlideSpec): Promise<GeneratedImage> {
    const { width, height } = BRAND.size;
    const c = BRAND.colors;
    const dark = spec.template === "headline" || spec.template === "cta";
    const bg = dark ? c.ink : c.paper;
    const fg = dark ? c.paper : c.ink;

    const res = new ImageResponse(
      (
        <div style={{ width, height, display: "flex", flexDirection: "column", background: bg, color: fg, padding: 88, fontFamily: "Geist" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, opacity: 0.85 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: c.accent }} />
              <span style={{ fontWeight: 700 }}>{BRAND.name}</span>
            </div>
            {spec.slideCount ? <span>{`${spec.slideNumber ?? 1}/${spec.slideCount}`}</span> : <span />}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 36 }}>
            {spec.eyebrow ? (
              <div style={{ display: "flex", fontSize: 34, color: c.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: 4 }}>{spec.eyebrow}</div>
            ) : null}
            <div style={{ display: "flex", fontSize: spec.headline.length > 60 ? 76 : 96, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 }}>
              {spec.headline}
            </div>
            {spec.body ? <div style={{ display: "flex", fontSize: 40, lineHeight: 1.35, opacity: 0.85 }}>{spec.body}</div> : null}
            {spec.template === "before_after" && spec.imageUrls?.length === 2 ? (
              <div style={{ display: "flex", gap: 24 }}>
                {spec.imageUrls.map((u, i) => (
                  <div key={u} style={{ display: "flex", flexDirection: "column", gap: 12, width: 440 }}>
                    <img src={u} width={440} height={520} style={{ objectFit: "cover", borderRadius: 24 }} />
                    <span style={{ fontSize: 30, fontWeight: 700 }}>{i === 0 ? "Before" : "After"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
            <span style={{ opacity: 0.7 }}>{BRAND.handle}</span>
            <div style={{ display: "flex", height: 10, width: 220, background: `linear-gradient(90deg, ${c.accent}, ${c.sun}, ${c.teal})`, borderRadius: 5 }} />
          </div>
        </div>
      ),
      { width, height, fonts: await loadFonts() },
    );

    const png = Buffer.from(await res.arrayBuffer());
    const bytes = await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { bytes, mime: "image/jpeg", width, height, generator: `template:${spec.template}`, isAiGenerated: false };
  }
}
