export interface SlideSpec {
  template: "headline" | "tip" | "before_after" | "portfolio" | "cta";
  eyebrow?: string;
  headline: string;
  body?: string;
  slideNumber?: number;
  slideCount?: number;
  /** Only for before_after/portfolio — must reference authorised assets. */
  imageUrls?: string[];
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: "image/jpeg";
  width: number;
  height: number;
  generator: string;
  isAiGenerated: boolean;
}

export interface ImageProvider {
  readonly name: string;
  renderSlide(spec: SlideSpec): Promise<GeneratedImage>;
}

export const BRAND = {
  name: "WebCraft TT",
  handle: "@webcraft.tt",
  colors: { ink: "#0B1220", paper: "#F7F5EF", accent: "#E4572E", teal: "#0E9F9A", sun: "#F2B134" },
  size: { width: 1080, height: 1350 }, // 4:5 portrait — best feed real estate
};
