import {
  ENTRY_CONTENT_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  getEntryText,
  getEntryTextLength,
  sanitizeEntryHtml,
} from "./entryContent";

export const TODO_TITLE_MAX_LENGTH = ENTRY_TITLE_MAX_LENGTH;
export const TODO_CONTENT_MAX_LENGTH = ENTRY_CONTENT_MAX_LENGTH;
export const sanitizeTodoHtml = sanitizeEntryHtml;
export const getTodoText = getEntryText;
export const getTodoTextLength = getEntryTextLength;
export const getTodoContentLength = getEntryTextLength;
