import type { ColorConstant } from "../constants/colors";
import { PRESET_COLORS } from "../constants/colors";
import { fetchAuthenticatedJson, postAuthenticatedJson, patchAuthenticatedJson, deleteAuthenticatedWithoutResponse } from "./authenticatedApi";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, type LibrarySearchFilters, type SearchField, type SearchItemType } from "./librarySearchFilters";
import { SMART_VIEW_ICONS } from "../constants/smartViewIcons";

export interface SavedSmartView {
  id: string;
  name: string;
  icon: string;
  color: ColorConstant;
  query: string;
  filters: LibrarySearchFilters;
  createdAt: string;
}

export type NewSavedSmartView = Omit<SavedSmartView, "id" | "createdAt">;
export type SavedSmartViewAppearance = Pick<SavedSmartView, "name" | "icon" | "color">;
type CipherRow = { id: string; encryptedView: string; createdAt: string };
type Encrypt = (value: string) => Promise<string>;
type Decrypt = (value: string) => Promise<string>;
const path = "/v1/account/saved-smart-views";
const fields: SearchField[] = ["all", "title", "url", "tag", "collection"];
const itemTypes: SearchItemType[] = ["all", "bookmark", "note", "todo", "readspace", "highlight"];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parsePayload(value: unknown): NewSavedSmartView | null {
  if (!record(value) || value.version !== 1 || typeof value.name !== "string" ||
    value.name.trim().length < 1 || value.name.length > 80 ||
    typeof value.query !== "string" || value.query.length > 500 ||
    typeof value.icon !== "string" || !SMART_VIEW_ICONS.some((icon) => icon.id === value.icon) ||
    !PRESET_COLORS.includes(value.color as ColorConstant) || !record(value.filters)) return null;
  const f = value.filters;
  if (!fields.includes(f.field as SearchField) || !itemTypes.includes(f.itemType as SearchItemType) ||
    !(f.tagId === null || typeof f.tagId === "string") ||
    !(f.collectionId === null || typeof f.collectionId === "string") ||
    typeof f.favoritesOnly !== "boolean") return null;
  const filters: LibrarySearchFilters = {
    field: f.field as SearchField, itemType: f.itemType as SearchItemType,
    tagId: f.tagId as string | null, collectionId: f.collectionId as string | null,
    favoritesOnly: f.favoritesOnly,
  };
  if (!hasActiveLibrarySearch(value.query, filters)) return null;
  return { name: value.name.trim(), query: value.query.trim(), icon: value.icon,
    color: value.color as ColorConstant, filters };
}

function parseRow(value: unknown): CipherRow {
  if (!record(value) || typeof value.id !== "string" || typeof value.encryptedView !== "string" ||
    !value.encryptedView.startsWith("enc:") ||
    typeof value.createdAt !== "string") throw new Error("Could not load Saved Smart Views.");
  return { id: value.id, encryptedView: value.encryptedView, createdAt: value.createdAt };
}

async function decryptRow(row: CipherRow, decrypt: Decrypt): Promise<SavedSmartView> {
  const payload: unknown = JSON.parse(await decrypt(row.encryptedView));
  const parsed = parsePayload(payload);
  if (!parsed) throw new Error("A Saved Smart View could not be decrypted.");
  return { ...parsed, id: row.id, createdAt: row.createdAt };
}

export async function loadSavedSmartViews(token: string, decrypt: Decrypt): Promise<SavedSmartView[]> {
  const response = await fetchAuthenticatedJson(path, token, "Could not load Saved Smart Views.");
  if (!record(response) || !Array.isArray(response.data)) throw new Error("Could not load Saved Smart Views.");
  return Promise.all(response.data.map((row) => decryptRow(parseRow(row), decrypt)));
}

export async function createSavedSmartView(token: string, view: NewSavedSmartView, encrypt: Encrypt): Promise<SavedSmartView> {
  const validated = parsePayload({ ...view, version: 1 });
  if (!validated) throw new Error("Enter a name and choose an active search to save.");
  const encryptedView = await encrypt(JSON.stringify({ version: 1, ...validated }));
  const response = await postAuthenticatedJson(path, token, { encryptedView }, "Could not save Smart View.");
  if (!record(response)) throw new Error("Could not save Smart View.");
  const row = parseRow(response.data);
  return { ...validated, id: row.id, createdAt: row.createdAt };
}

export async function updateSavedSmartView(token: string, view: SavedSmartView, appearance: SavedSmartViewAppearance,
  encrypt: Encrypt): Promise<SavedSmartView> {
  const validated = parsePayload({ ...view, ...appearance, version: 1 });
  if (!validated) throw new Error("Enter a valid name, icon, and color.");
  const encryptedView = await encrypt(JSON.stringify({ version: 1, ...validated }));
  const response = await patchAuthenticatedJson(`${path}/${encodeURIComponent(view.id)}`, token,
    { encryptedView }, "Could not update Smart View.");
  if (!record(response)) throw new Error("Could not update Smart View.");
  const row = parseRow(response.data);
  if (row.id !== view.id) throw new Error("Could not update Smart View.");
  return { ...validated, id: row.id, createdAt: row.createdAt };
}

export async function deleteSavedSmartView(token: string, id: string): Promise<void> {
  await deleteAuthenticatedWithoutResponse(`${path}/${encodeURIComponent(id)}`, token, "Could not delete Smart View.");
}

export const DEFAULT_NEW_SMART_VIEW: Pick<NewSavedSmartView, "icon" | "color" | "filters"> = {
  icon: "sparkles", color: "BLUE", filters: DEFAULT_LIBRARY_SEARCH_FILTERS,
};
