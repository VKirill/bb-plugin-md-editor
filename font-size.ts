export const FONT_SIZE_KEY = "md-editor:font-size";

/** An absent or invalid preference follows BB's typography. */
export function parseFontSize(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const size = Number(value);
  return Number.isInteger(size) && size >= 10 && size <= 32 ? size : null;
}
