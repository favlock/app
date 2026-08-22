import {
  ENTRY_CONTENT_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  getEntryText,
  getEntryTextLength,
  sanitizeEntryHtml,
} from "./entryContent";

export const NOTE_TITLE_MAX_LENGTH = ENTRY_TITLE_MAX_LENGTH;
export const NOTE_CONTENT_MAX_LENGTH = ENTRY_CONTENT_MAX_LENGTH;
export const sanitizeNoteHtml = sanitizeEntryHtml;
export const getNoteText = getEntryText;
export const getNoteTextLength = getEntryTextLength;
