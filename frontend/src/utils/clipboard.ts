/**
 * Copy text from inside a tap handler. execCommand runs synchronously, so it
 * keeps the user gesture that iOS Safari demands — navigator.clipboard
 * rejected there (NotAllowedError) and the button looked dead, because the
 * fallback textarea opened below the fold of a scrolled panel.
 */
export function copyViaSelection(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // Off-screen but not display:none (unselectable); 16px stops iOS zooming.
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS ignores select() alone
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

/** Selection copy first (see above), then the async Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  if (copyViaSelection(text)) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
