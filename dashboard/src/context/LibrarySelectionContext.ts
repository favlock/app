import { createContext } from "react";
export interface LibraryItemSelection {
  checked: boolean;
  disabled: boolean;
  title: string;
  toggle: (range: boolean) => void;
}
export const LibrarySelectionContext = createContext<LibraryItemSelection | null>(null);
