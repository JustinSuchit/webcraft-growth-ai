import "server-only";
import { env } from "@/lib/env";
import { OpenAIImageProvider } from "./openai";
import { TemplateImageProvider } from "./template";
import type { ImageProvider } from "./types";

export * from "./types";

/** Replaceable adapter: add a provider class and a case here. */
export function imageProvider(kind = env().IMAGE_PROVIDER): ImageProvider {
  switch (kind) {
    case "openai":
      return new OpenAIImageProvider();
    case "template":
    default:
      return new TemplateImageProvider();
  }
}
