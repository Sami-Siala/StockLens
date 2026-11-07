/**
 * Copy `text` to the clipboard. Tries the async Clipboard API, then the old select-and-copy on
 * `field` (older browsers, non-secure pages). Returns false when both fail; the field is then left
 * selected so the person can press Ctrl/Cmd+C.
 */
export async function copyText(
  text: string,
  field?: HTMLInputElement | null,
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or unsupported: fall through */
  }
  try {
    if (field) {
      field.focus();
      field.select();
      return document.execCommand("copy");
    }
  } catch {
    /* nothing left to try */
  }
  try {
    field?.select();
  } catch {
    /* ignore */
  }
  return false;
}
