import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SEARCH_ENGINES, type SearchEngine } from '../constants/searchEngines';

interface BookmarkUIStore {
  // UI State only - Server state is managed by React Query
  selectedFolderId: string | null;
  setSelectedFolderId: (folderId: string | null) => void;
  selectedTagId: string | null;
  setSelectedTagId: (tagId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedEngine: SearchEngine;
  setSelectedEngine: (engine: SearchEngine) => void;
  reset: () => void;
}

const defaultSearchEngine =
  SEARCH_ENGINES.find((e) => e.slug === "google") ?? SEARCH_ENGINES[0];

export const useBookmarkStore = create<BookmarkUIStore>()(
  persist(
    (set) => ({
      // Initial state
      selectedFolderId: null,
      selectedTagId: null,
      searchQuery: '',
      selectedEngine: defaultSearchEngine,

      // UI State actions
      setSelectedFolderId: (folderId) => set({ selectedFolderId: folderId, selectedTagId: null }),
      setSelectedTagId: (tagId) => set({ selectedTagId: tagId, selectedFolderId: null }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedEngine: (engine) => set({ selectedEngine: engine }),
      reset: () => set({ selectedFolderId: null, selectedTagId: null, searchQuery: '' }),
    }),
    {
      name: 'bookmark-ui-store',
      partialize: (state) => ({
        selectedFolderId: state.selectedFolderId,
        selectedTagId: state.selectedTagId,
        selectedEngine: state.selectedEngine,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<BookmarkUIStore>),
        searchQuery: '',
      }),
    }
  )
);
