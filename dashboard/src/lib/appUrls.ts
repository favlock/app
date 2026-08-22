function readPublicUrl(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }

  return url.toString().replace(/\/$/, "");
}

export const WEB_URL = readPublicUrl(
  "VITE_WEB_URL",
  import.meta.env.VITE_WEB_URL,
);

export const DASHBOARD_URL = readPublicUrl(
  "VITE_DASHBOARD_URL",
  import.meta.env.VITE_DASHBOARD_URL,
);

export const API_URL = readPublicUrl(
  "VITE_API_URL",
  import.meta.env.VITE_API_URL,
);

export const CHROME_EXTENSION_URL = readPublicUrl(
  "VITE_CHROME_EXTENSION_URL",
  import.meta.env.VITE_CHROME_EXTENSION_URL ??
    "https://chromewebstore.google.com/search/FavLock",
);

export const CREEM_PRO_PRODUCT_URL =
  import.meta.env.VITE_CREEM_PRO_PRODUCT_URL ?? "";

export const WEB_DOCS_URL = `${WEB_URL}/docs`;
export const WEB_PRIVACY_URL = `${WEB_URL}/privacy`;
export const WEB_TERMS_URL = `${WEB_URL}/terms`;
export const DASHBOARD_HOME_URL = `${DASHBOARD_URL}/`;
export const DASHBOARD_RESET_PASSWORD_URL = `${DASHBOARD_URL}/reset-password`;
