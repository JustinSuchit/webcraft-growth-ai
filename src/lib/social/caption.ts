/** Instagram caption = caption + hashtags (max 30 tags, 2,200 characters). */
export function composeCaption(caption: string, hashtags: string[]) {
  const tags = [...new Set(hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean))].slice(0, 30).map((h) => `#${h}`).join(" ");
  return `${caption.trim()}${tags ? `\n\n${tags}` : ""}`.slice(0, 2200);
}
