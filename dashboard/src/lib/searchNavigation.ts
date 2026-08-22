export function getDirectNavigationUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  if (!hasHttpProtocol && /\s/.test(trimmed)) return null;

  try {
    const url = new URL(hasHttpProtocol ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const isLocalAddress =
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname);

    if (!hasHttpProtocol && !isLocalAddress && !url.hostname.includes('.')) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
