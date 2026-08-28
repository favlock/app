import { getEntryPlainText, sanitizeEntryHtml } from "./entryContent";

export async function copyEntryContent(
  html: string,
  plainText = false,
): Promise<void> {
  const clean = sanitizeEntryHtml(html);
  const text = getEntryPlainText(clean);
  if (plainText) {
    if (!navigator.clipboard?.writeText)
      throw new Error(
        "Clipboard access is unavailable. Select the text and copy it with your keyboard.",
      );
    await navigator.clipboard.writeText(text);
    return;
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error(
      "Formatted copy is unavailable in this browser. Select the text and copy it with your keyboard.",
    );
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([clean], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    }),
  ]);
}
