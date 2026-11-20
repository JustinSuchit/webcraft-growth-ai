import "server-only";
import sharp from "sharp";
import { env } from "@/lib/env";
import { IntegrationError } from "../errors";
import { BRAND, type GeneratedImage, type ImageProvider, type SlideSpec } from "./types";

/**
 * Optional AI background/illustration provider. Text is NOT baked in by the model (it garbles
 * text); use it for illustrative imagery only. Posts using it are published with is_ai_generated.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";

  async renderSlide(spec: SlideSpec): Promise<GeneratedImage> {
    const e = env();
    if (!e.OPENAI_API_KEY) throw new IntegrationError("openai", "OPENAI_API_KEY not configured", true);
    const prompt = [
      `Clean, modern editorial illustration for an Instagram post by a Caribbean web development studio.`,
      `Topic: ${spec.headline}. ${spec.body ?? ""}`,
      `Palette: deep navy ${BRAND.colors.ink}, warm off-white ${BRAND.colors.paper}, accent ${BRAND.colors.accent}, teal ${BRAND.colors.teal}.`,
      `No text, no logos, no real people, no brand names.`,
    ].join(" ");
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${e.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: e.OPENAI_IMAGE_MODEL, prompt, size: "1024x1536", n: 1 }),
    });
    if (!res.ok) throw new IntegrationError("openai", `HTTP ${res.status}`, res.status < 500 && res.status !== 429);
    const json = (await res.json()) as { data: { b64_json: string }[] };
    const raw = Buffer.from(json.data[0]?.b64_json ?? "", "base64");
    const { width, height } = BRAND.size;
    const bytes = await sharp(raw).resize(width, height, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
    return { bytes, mime: "image/jpeg", width, height, generator: `openai:${e.OPENAI_IMAGE_MODEL}`, isAiGenerated: true };
  }
}
