import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckSquare, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { editCloudBookmarkBatch, isBulkSuccess, runBookmarkBulkEdit, type BookmarkBulkResult } from "../lib/bookmarkBulk";
import { editLocalBookmarkBatch } from "../lib/localVault";
import { captureLocalVaultWork, trackLocalVaultWork } from "../lib/localVaultWork";
import { isTaskBulkAction } from "../lib/entryBulk";
import { editLibraryBatch, type LibraryBulkAction } from "../lib/libraryBulk";
import { Button } from "./ui/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "./ui/dialog";
import { Select } from "./ui/select";
import { Input } from "./ui/input";
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from "./ui/dropdown";

export interface BookmarkSelection {
  active: boolean;
  selected: Set<string>;
  busy: boolean;
  toggle: (id: string, range: boolean) => void;
}
interface Props {
  heading?: ReactNode;
  libraryItems?: boolean;
  shown: { id: string }[];
  total: number;
  loading: boolean;
  getAll: () => Promise<{ id: string }[]>;
  onModeChange?: (active: boolean) => void;
  children: (selection: BookmarkSelection) => ReactNode;
}

export default function BookmarkBulkEditor(props: Props) {
  const { user } = useAuth();
  const { cryptoKey } = useEncryption();
  return <BookmarkBulkSession key={`${user?.id ?? ""}:${!!cryptoKey}`} {...props} />;
}

function BookmarkBulkSession({ heading, libraryItems = false, shown, total, loading, getAll, onModeChange, children }: Props) {
  const { user, session, isLocalAccount, cloudStatus, retryBookmarkCacheSync } = useAuth();
  const { cryptoKey } = useEncryption();
  const queryClient = useQueryClient();
  const online = useBrowserOnline();
  const foldersQuery = useFolders();
  const tagsQuery = useTags();
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<LibraryBulkAction["action"] | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [clearDueDate, setClearDueDate] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<BookmarkBulkResult[] | null>(null);
  const [retryAction, setRetryAction] = useState<LibraryBulkAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const selectButton = useRef<HTMLButtonElement>(null);
  const current = useRef({ userId: user?.id, cryptoKey });
  useLayoutEffect(() => { current.current = { userId: user?.id, cryptoKey }; }, [user?.id, cryptoKey]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    onModeChange?.(active);
    return () => onModeChange?.(false);
  }, [active, onModeChange]);

  const finishSelection = () => {
    setActive(false); setSelected(new Set()); setDialog(null); setAnchor(null);
    requestAnimationFrame(() => selectButton.current?.focus());
  };
  useEffect(() => {
    if (!active || dialog || busy || resolving) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setActive(false); setSelected(new Set()); setAnchor(null);
        requestAnimationFrame(() => selectButton.current?.focus());
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active, dialog, busy, resolving]);

  useEffect(() => {
    if (!busy) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [busy]);

  const noun = libraryItems ? "items" : "bookmarks";
  const tasksAvailable = libraryItems && selected.size > 0 && [...selected].every((id) => id.startsWith("task:"));
  const favoritesAvailable = !libraryItems || (selected.size > 0 && [...selected].every((id) => id.startsWith("bookmark:")));
  const available = !!user && !!cryptoKey && (isLocalAccount || (online && cloudStatus === "available"));
  const blocked = busy || resolving;
  const toggle = (id: string, range: boolean) => {
    if (busy || resolving) return;
    setResult(null); setRetryAction(null);
    const rangeAnchor = anchor;
    setSelected((previous) => {
      const next = new Set(previous);
      const select = !previous.has(id);
      const first = shown.findIndex((bookmark) => bookmark.id === rangeAnchor);
      const last = shown.findIndex((bookmark) => bookmark.id === id);
      const ids = range && first >= 0 && last >= 0
        ? shown.slice(Math.min(first, last), Math.max(first, last) + 1).map((bookmark) => bookmark.id)
        : [id];
      for (const item of ids) { if (select) next.add(item); else next.delete(item); }
      return next;
    });
    setAnchor(id);
  };
  const selectAll = async () => {
    setResolving(true); setError(null);
    try {
      const all = await getAll();
      if (mounted.current) { setSelected(new Set(all.map((bookmark) => bookmark.id))); setResult(null); setRetryAction(null); }
    } catch {
      if (mounted.current) setError("Could not select all results. Try again.");
    } finally { if (mounted.current) setResolving(false); }
  };
  const apply = async (action: LibraryBulkAction) => {
    if (pending.current || !available || !user || !selected.size) return;
    if (isTaskBulkAction(action) && !tasksAvailable) return;
    pending.current = true; setBusy(true); setError(null); setResult(null);
    const ids = [...selected];
    const ownerId = user.id;
    const key = cryptoKey;
    const localGuard = captureLocalVaultWork(ownerId);
    const assertCurrent = () => {
      if (!mounted.current || current.current.userId !== ownerId || current.current.cryptoKey !== key)
        throw new Error("The vault changed.");
      if (isLocalAccount) localGuard();
    };
    setProgress({ completed: 0, total: ids.length });
    const invalidate = () => {
      // A route change may unmount this view after an in-flight batch commits.
      // Refresh observers even then so returning to the library shows the writes.
      if (current.current.userId === ownerId) retryBookmarkCacheSync();
      for (const queryKey of [["notes"], ["todos"], ["readspace"], ["entries"], ["bookmarks"], ["tags"], ["tag-bookmark-ids"], ["lists"], ["trash"], ["highlights"], ["resource-usage"]])
        void queryClient.invalidateQueries({ queryKey });
    };
    try {
      const results = await runBookmarkBulkEdit(ids, (batch) => libraryItems
        ? trackLocalVaultWork(ownerId, editLibraryBatch(batch, action, { local: isLocalAccount, ownerId, token: session?.access_token ?? "", assertCurrent }))
        : isTaskBulkAction(action) ? Promise.reject(new Error("Select tasks for this action.")) : isLocalAccount
        ? trackLocalVaultWork(ownerId, editLocalBookmarkBatch(ownerId, batch, action, assertCurrent))
        : editCloudBookmarkBatch(session?.access_token ?? "", batch, action), assertCurrent,
      (completed) => { setProgress({ completed, total: ids.length }); });
      assertCurrent();
      setResult(results);
      setSelected(new Set(results.filter((item) => !isBulkSuccess(item)).map((item) => item.bookmarkId)));
      setRetryAction(action);
      setDialog(null);
    } catch {
      if (mounted.current) setError("The operation stopped. Refresh the library before trying again.");
    } finally {
      invalidate();
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const openAction = (action: LibraryBulkAction["action"]) => {
    setDueDate(""); setClearDueDate(false);
    setDialog(action); setFolderId(""); setTagIds([]); setTagSearch(""); setError(null);
  };
  const labels = {
    "due-date": "Change due date", complete: "Mark as completed", reopen: "Mark as open",
    collection: "Change collection", "add-tags": "Add tags", "remove-tags": "Remove tags",
    favorite: "Add to favorites", unfavorite: "Remove from favorites", trash: isLocalAccount ? "Delete permanently" : "Move to Trash",
  };
  const successful = result?.filter(isBulkSuccess).length ?? 0;
  const failed = result ? result.length - successful : 0;
  const tagLimit = result?.filter((item) => item.status === "tag-limit").length ?? 0;
  const tags = (tagsQuery.data ?? []).filter((tag) => tag.name.toLocaleLowerCase().includes(tagSearch.toLocaleLowerCase()));
  const isTagAction = dialog === "add-tags" || dialog === "remove-tags";
  const taxonomyUnavailable = isTagAction
    ? tagsQuery.isLoading || !!tagsQuery.error
    : dialog === "collection" && (foldersQuery.isLoading || !!foldersQuery.error);
  const submit = () => {
    if (!dialog) return;
    if (dialog === "due-date") void apply({ action: dialog, dueDate: clearDueDate ? null : dueDate });
    else if (dialog === "collection") void apply({ action: dialog, folderId: folderId || null });
    else if (dialog === "add-tags" || dialog === "remove-tags") void apply({ action: dialog, tagIds });
    else void apply({ action: dialog });
  };

  return <div className={`space-y-3 ${active ? "pb-36 sm:pb-0" : ""}`}>
    {(heading || !active) && <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      {heading && <div className="min-w-0">{heading}</div>}
      {!active && <Button ref={selectButton} plain className="library-select-button ml-auto shrink-0" disabled={loading || !total || !cryptoKey} onClick={() => { setActive(true); setResult(null); }}>
        <CheckSquare data-slot="icon" aria-hidden="true" />
        Select {noun}
      </Button>}
    </div>}
    {active && <div className="bookmark-bulk-toolbar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 space-y-2 rounded-2xl border border-[var(--app-mint-border)] bg-[var(--app-card)] p-2 shadow-sm sm:sticky sm:inset-x-auto sm:bottom-auto sm:top-2" aria-label={libraryItems ? "Library selection" : "Bookmark selection"}>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <span className="mr-auto px-2 text-sm font-semibold tabular-nums sm:mr-2" role="status">{selected.size.toLocaleString()} selected</span>
        <Button plain disabled={blocked || loading || !total} onClick={() => void selectAll()}>{resolving ? "Selecting…" : "Select all"}</Button>
        <Button plain disabled={blocked || !selected.size} onClick={() => { setSelected(new Set()); setResult(null); setRetryAction(null); }}>Clear</Button>
        <div className="flex w-full items-center justify-between gap-2 border-t border-[var(--app-mint-border)] pt-2 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
          <Dropdown>
            <DropdownButton color="emerald" disabled={blocked || !selected.size || !available}>
              Actions <ChevronDown data-slot="icon" aria-hidden="true" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              {(Object.keys(labels) as LibraryBulkAction["action"][]).filter((action) => !isTaskBulkAction({ action }) || tasksAvailable).filter((action) => favoritesAvailable || (action !== "favorite" && action !== "unfavorite")).map((action) =>
                <DropdownItem key={action} onClick={() => openAction(action)}>{labels[action]}</DropdownItem>)}
            </DropdownMenu>
          </Dropdown>
          <Button plain disabled={blocked} onClick={finishSelection}>Done</Button>
        </div>
      </div>
      {!available && <p className="text-sm text-[var(--app-muted)]">{cryptoKey ? "Reconnect to apply changes to your cloud items." : "Unlock your vault to edit items."}</p>}
      {busy && <p role="status" className="text-sm">Updating {noun}… {progress.completed} of {progress.total}</p>}
    </div>}
    {error && <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p>}
    {result && <div role={failed ? "alert" : "status"} className="rounded-2xl bg-[var(--app-highlight)] p-3 text-sm">
      {successful} {successful === 1 ? (libraryItems ? "item" : "bookmark") : noun} {retryAction?.action === "trash" ? (isLocalAccount ? "deleted" : "moved to Trash") : "updated or already up to date"}.
      {failed > 0 && <> {failed} could not be updated. Only these {noun} remain selected.
        {tagLimit > 0 && <> {tagLimit} would exceed the limit of 10 tags per item.</>}
        <Button outline className="ml-2" disabled={blocked || !available} onClick={() => { if (retryAction) void apply(retryAction); }}>Retry failed</Button>
      </>}
    </div>}
    {children({ active, selected, busy: blocked, toggle })}
    <Dialog open={dialog !== null} onClose={() => { if (!pending.current) setDialog(null); }} size="md">
      <DialogTitle>{dialog ? labels[dialog] : "Edit items"}</DialogTitle>
      <DialogDescription>{selected.size} selected {noun}.
        {dialog === "trash" ? (isLocalAccount ? " These will be permanently deleted from this device and cannot be restored." : " You can restore them from Trash before their recovery period expires.") :
          dialog === "add-tags" ? " Existing tags will be preserved. Each item can have up to 10 tags." :
          dialog === "remove-tags" ? " Only the chosen tags will be removed. The tags themselves will remain in your library." : " Other fields will stay unchanged."}
      </DialogDescription>
      <DialogBody>
        {dialog === "due-date" && <div className="space-y-3">
          <label className="block text-sm font-medium">Due date
            <Input type="date" aria-label="Due date" min="0001-01-01" max="9999-12-31" value={dueDate} disabled={busy || clearDueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={clearDueDate} disabled={busy} onChange={(event) => setClearDueDate(event.target.checked)} />
            Remove due date
          </label>
        </div>}

        {dialog === "collection" && <Select className="[&>select]:text-[var(--app-ink)]" aria-label="Destination collection" value={folderId} disabled={busy} onChange={(event) => setFolderId(event.target.value)}>
          <option value="">No collection</option>
          {(foldersQuery.data ?? []).map((folder) => <option key={folder.id} value={folder.id}>{folder.parent_id ? "↳ " : ""}{folder.name}</option>)}
        </Select>}
        {isTagAction && <div className="space-y-3">
          <Input aria-label="Find tags" placeholder="Find tags…" value={tagSearch} disabled={busy} onChange={(event) => setTagSearch(event.target.value)} />
          <div className="max-h-60 overflow-y-auto">
            {tags.map((tag) => <label key={tag.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--app-primary)]" checked={tagIds.includes(tag.id)} disabled={busy || (tagIds.length >= 10 && !tagIds.includes(tag.id))}
                onChange={(event) => setTagIds((previous) => event.target.checked ? [...previous, tag.id] : previous.filter((id) => id !== tag.id))} />
              <span className="break-all">{tag.name}</span>
            </label>)}
            {!tags.length && <p className="text-sm text-[var(--app-muted)]">{tagSearch ? "No matching tags." : "No tags yet. Add a tag to an item first, then apply it to your selection."}</p>}
          </div>
        </div>}
        {taxonomyUnavailable && <p role="status" className="mt-2 text-sm">{tagsQuery.error || foldersQuery.error ? "Could not load your organization options. Close this dialog and try again." : "Loading…"}</p>}
        {busy && <p role="status" className="mt-3 text-sm">Updating {progress.completed} of {progress.total} {noun}…</p>}
      </DialogBody>
      <DialogActions>
        <Button outline disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
        <Button color={dialog === "trash" ? "red" : "emerald"} disabled={busy || !available || taxonomyUnavailable || (dialog === "due-date" && !clearDueDate && !dueDate) || (isTagAction && !tagIds.length)} onClick={submit}>
          {busy ? "Updating…" : `${dialog ? labels[dialog] : "Apply"} (${selected.size})`}
        </Button>
      </DialogActions>
    </Dialog>
  </div>;
}
