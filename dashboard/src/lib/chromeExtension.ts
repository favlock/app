export function isGoogleChrome(userAgent: string, vendor: string): boolean {
  return (
    vendor === "Google Inc." &&
    /Chrome\//.test(userAgent) &&
    !/(?:Edg|OPR|Opera|SamsungBrowser)\//.test(userAgent)
  );
}
