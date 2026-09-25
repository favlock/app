import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useNotes } from "./useNotesQuery";
import { useTodos } from "./useTodosQuery";
import { useReadspace } from "./useReadspaceQuery";
import { useHighlights } from "./useHighlightsQuery";
import { useBookmarks } from "./useBookmarksQuery";
import { searchBookmarkLibrary } from "./useBookmarkLocalSearch";
import { searchNotes } from "../lib/noteSearch";
import { searchTodos } from "../lib/todoSearch";
import { searchReadspaceArticles } from "../lib/readspaceSearch";
import { searchHighlights } from "../lib/highlightSearch";
import { parseReadspaceContent } from "../lib/readspaceContent";
import type { SavedSmartView } from "../lib/savedSmartViews";
import { useAccountPlan } from "./useAccountPlanQuery";

export function useSavedSmartViewCounts(views: SavedSmartView[]) {
  const { user, isLocalAccount, bookmarkCacheSyncedAt } = useAuth();
  const ownerId = user?.id;
  const { cryptoKey } = useEncryption();
  const { data: plan } = useAccountPlan();
  const includeContent = plan?.id === "pro";
  const enabled = views.length > 0 && !!cryptoKey && !isLocalAccount;
  const notes = useNotes({ enabled });
  const todos = useTodos({ enabled });
  const readspace = useReadspace(enabled);
  const highlights = useHighlights(enabled);
  const sourceBookmarks = useBookmarks(null, { enabled, includeHighlightSources: true });
  const articles = useMemo(() => (readspace.data ?? []).flatMap((entry) => {
    const content = parseReadspaceContent(entry.content);
    return content ? [{ entry, content }] : [];
  }), [readspace.data]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !ownerId || !bookmarkCacheSyncedAt || !notes.data || !todos.data ||
        !readspace.data || !highlights.data || !sourceBookmarks.data) {
      setCounts((current) => Object.keys(current).length ? {} : current);
      return;
    }
    let current = true;
    void Promise.all(views.map(async (view) => {
      const bookmarks = await searchBookmarkLibrary(ownerId, cryptoKey, false, view.query,
        { limit: 1, filters: view.filters });
      const noteCount = searchNotes(notes.data, view.query, { includeContent, filters: view.filters }).length;
      const todoCount = searchTodos(todos.data, view.query, { includeContent, filters: view.filters }).length;
      const articleCount = searchReadspaceArticles(articles, view.query, 1,
        { includeContent, filters: view.filters }).total;
      const highlightCount = searchHighlights(highlights.data, sourceBookmarks.data, articles,
        view.query, { includeAnnotations: includeContent, filters: view.filters }).length;
      return [view.id, bookmarks.total + noteCount + todoCount + articleCount + highlightCount] as const;
    })).then((entries) => {
      if (current) setCounts(Object.fromEntries(entries));
    }).catch(() => { if (current) setCounts({}); });
    return () => { current = false; };
  }, [views, enabled, ownerId, cryptoKey, bookmarkCacheSyncedAt,
    notes.data, todos.data, readspace.data, highlights.data, sourceBookmarks.data, articles, includeContent]);

  return counts;
}
