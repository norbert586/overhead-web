// Canvas can't read var(--x), so effects resolve the theme tokens to plain
// colour strings — and re-resolve when <html data-theme> flips, so a canvas
// follows the day/night chart like every CSS rule does. Never hard-code a hex
// in an effect; add a token to App.css instead.

/** Resolved token values, keyed by name without the leading `--`. */
export type ThemeTokens = Record<string, string>;

export function readThemeTokens(names: readonly string[]): ThemeTokens {
  const style = getComputedStyle(document.documentElement);
  const out: ThemeTokens = {};
  for (const n of names) out[n] = style.getPropertyValue(`--${n}`).trim();
  return out;
}

/**
 * A `--x-rgb` token ("28 100 151") at an alpha, in the comma form every
 * canvas implementation accepts.
 */
export function rgba(rgbToken: string | undefined, alpha: number): string {
  const [r = 0, g = 0, b = 0] = (rgbToken ?? '').split(/[\s,]+/).map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Calls `cb` whenever the theme changes (useTheme writes <html data-theme>). */
export function onThemeChange(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
