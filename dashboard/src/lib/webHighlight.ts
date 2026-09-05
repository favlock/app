export const WEB_HIGHLIGHT_VERSION = 1;
export const WEB_HIGHLIGHT_QUOTE_MAX_LENGTH = 10_000;

export type WebHighlightColor = "yellow" | "green" | "blue" | "pink";

export type WebHighlightPayload = {
  version: typeof WEB_HIGHLIGHT_VERSION;
  quote: { exact: string; prefix: string; suffix: string };
  position: { start: number; end: number } | null;
  dom: {
    startPath: string;
    startOffset: number;
    endPath: string;
    endOffset: number;
  } | null;
  color: WebHighlightColor;
  note: string;
  capturedAt: string;
};

export type EncryptedWebHighlightPayload = {
  version: 1;
  encryptedQuote: string;
  encryptedAnchors: string;
  encryptedAnnotation: string | null;
  color: WebHighlightColor;
};

type EncryptField = (value: string) => Promise<string>;
type DecryptField = (value: string) => Promise<string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

export function parseWebHighlightPayload(value: string): WebHighlightPayload | null {
  try {
    const payload: unknown = JSON.parse(value);
    if (!isRecord(payload) || payload.version !== WEB_HIGHLIGHT_VERSION) return null;
    const quote = payload.quote;
    if (
      !isRecord(quote) ||
      !boundedString(quote.exact, WEB_HIGHLIGHT_QUOTE_MAX_LENGTH) ||
      quote.exact.trim().length === 0 ||
      !boundedString(quote.prefix, 128) ||
      !boundedString(quote.suffix, 128)
    ) return null;
    const colors: WebHighlightColor[] = ["yellow", "green", "blue", "pink"];
    if (!colors.includes(payload.color as WebHighlightColor)) return null;
    if (!boundedString(payload.note, 10_000)) return null;
    if (typeof payload.capturedAt !== "string" || Number.isNaN(Date.parse(payload.capturedAt))) return null;

    let position: WebHighlightPayload["position"] = null;
    if (payload.position !== null) {
      if (!isRecord(payload.position)) return null;
      const { start, end } = payload.position;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Number(start) < 0 || Number(end) <= Number(start)) return null;
      position = { start: Number(start), end: Number(end) };
    }

    let dom: WebHighlightPayload["dom"] = null;
    if (payload.dom !== null) {
      if (!isRecord(payload.dom)) return null;
      const { startPath, startOffset, endPath, endOffset } = payload.dom;
      if (
        !boundedString(startPath, 1000) || !boundedString(endPath, 1000) ||
        !Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) ||
        Number(startOffset) < 0 || Number(endOffset) < 0
      ) return null;
      dom = { startPath, startOffset: Number(startOffset), endPath, endOffset: Number(endOffset) };
    }

    return {
      version: WEB_HIGHLIGHT_VERSION,
      quote: { exact: quote.exact, prefix: quote.prefix, suffix: quote.suffix },
      position,
      dom,
      color: payload.color as WebHighlightColor,
      note: payload.note,
      capturedAt: new Date(payload.capturedAt).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function encryptWebHighlightPayload(
  payload: WebHighlightPayload,
  encryptField: EncryptField,
): Promise<EncryptedWebHighlightPayload> {
  const note = payload.note.trim();
  const [encryptedQuote, encryptedAnchors, encryptedAnnotation] = await Promise.all([
    encryptField(JSON.stringify(payload.quote)),
    encryptField(JSON.stringify({
      position: payload.position,
      dom: payload.dom,
      capturedAt: payload.capturedAt,
    })),
    note ? encryptField(note) : Promise.resolve(null),
  ]);
  return {
    version: 1,
    encryptedQuote,
    encryptedAnchors,
    encryptedAnnotation,
    color: payload.color,
  };
}

export async function decryptWebHighlightPayload(
  payload: EncryptedWebHighlightPayload,
  decryptField: DecryptField,
): Promise<WebHighlightPayload | null> {
  try {
    const [quote, anchors, note] = await Promise.all([
      decryptField(payload.encryptedQuote).then((value) => JSON.parse(value) as unknown),
      decryptField(payload.encryptedAnchors).then((value) => JSON.parse(value) as unknown),
      payload.encryptedAnnotation
        ? decryptField(payload.encryptedAnnotation)
        : Promise.resolve(""),
    ]);
    if (!isRecord(anchors)) return null;
    return parseWebHighlightPayload(JSON.stringify({
      version: WEB_HIGHLIGHT_VERSION,
      quote,
      position: anchors.position,
      dom: anchors.dom,
      color: payload.color,
      note,
      capturedAt: anchors.capturedAt,
    }));
  } catch {
    return null;
  }
}
