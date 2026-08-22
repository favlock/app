export function getBookmarkShortcutModifier(
  platform: string,
  userAgent: string,
) {
  const isApplePlatform = /Mac|iPhone|iPad|iPod/.test(platform || userAgent);
  const isSafari =
    /Safari\//.test(userAgent) &&
    !/(?:Chrome|Chromium|CriOS|FxiOS|Edg|OPR)\//.test(userAgent);

  if (isApplePlatform && !isSafari) {
    return { label: "Command", display: "⌘" } as const;
  }

  return {
    label: "Control",
    display: isApplePlatform ? "⌃" : "Ctrl",
  } as const;
}
