import {
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { PRODUCT_VERSION } from "@favlock/shared";
import { AppLogo } from "./AppLogo";
import { useAuth } from "../context/useAuth";
import { useTheme } from "../context/useTheme";
import {
  useFolders,
  useAddFolder,
  useFolderBookmarkCounts,
  useReorderFolders,
} from "../hooks/useFoldersQuery";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTags, useTagBookmarkCounts } from "../hooks/useTagsQuery";
import {
  Check,
  Archive,
  LogOutIcon,
  Palette,
  PlusIcon,
  Heart,
  House,
  SettingsIcon,
  Tag,
  LifeBuoy,
  CircleHelp,
  ChevronDown,
  GripVertical,
  CornerDownRight,
  StickyNote,
  ListTodo,
  ListChecks,
  BookOpen,
  Trash2,
  Sparkles,
  ArrowRight,
  ArrowDownUp,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useUserInfo } from "../hooks/useUserInfoQuery";
import { getAccountDisplayName } from "../lib/auth";
import { useBookmarkCounts } from "../hooks/useBookmarksQuery";
import {
  PRESET_COLORS,
  getColorHex,
  getDisplayColor,
  COLOR_NONE,
  type ColorConstant,
} from "../constants/colors";
import { THEME_VARIANT_OPTIONS } from "../constants/themes";
import { FolderSidebarSkeleton } from "./FolderSidebarSkeleton";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "./ui/dropdown";
import { Button } from "./ui/button";
import { changelog } from "../data/changelog";
import type { Folder } from "../types/bookmark";
import {
  buildFolderPlacements,
  moveFolder,
  resolveFolderDragIntent,
  type FolderDragIntent,
} from "../lib/folderOrder";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useNoteCount } from "../hooks/useNotesQuery";
import { useTodoCount } from "../hooks/useTodosQuery";
import { useReadspaceCount } from "../hooks/useReadspaceQuery";
import { useTrashCount } from "../hooks/useTrashQuery";
import { useListCount } from "../hooks/useListsQuery";
import ProUpgradeDialog from "./ProUpgradeDialog";

const folderCollisionDetection: CollisionDetection = ({
  active,
  collisionRect,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  const targetY =
    pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2;

  return droppableContainers
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      if (!rect || container.disabled || container.id === active.id) return [];
      const distance = Math.abs(targetY - (rect.top + rect.height / 2));
      return [
        {
          id: container.id,
          data: { droppableContainer: container, value: distance },
        },
      ];
    })
    .sort((left, right) => left.data.value - right.data.value);
};

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
  onStartOnboarding?: () => void;
  onOpenDataTransfer?: () => void;
}

interface SortableCollectionProps {
  folder: Folder;
  count: number;
  selected: boolean;
  onSelect: () => void;
  previewDepth?: 0 | 1;
  isNestTarget: boolean;
  isBlocked: boolean;
}

function SortableCollection({
  folder,
  count,
  selected,
  onSelect,
  previewDepth,
  isNestTarget,
  isBlocked,
}: SortableCollectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });
  const displayAsChild =
    previewDepth === 1 || (previewDepth === undefined && !!folder.parent_id);

  return (
    <li
      ref={setNodeRef}
      data-folder-id={folder.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center rounded-lg transition-[margin,box-shadow,background-color] duration-150 ${
        displayAsChild ? "ml-4" : "ml-0"
      } ${isDragging ? "relative z-10 bg-white opacity-80 shadow-md" : ""} ${
        isNestTarget ? "bg-emerald-50/40 ring-1 ring-emerald-300/60" : ""
      } ${isBlocked ? "bg-red-50 ring-2 ring-red-400" : ""}`}
    >
      {displayAsChild && (
        <CornerDownRight
          className={`size-3 flex-none ${
            previewDepth === 1 ? "text-emerald-500" : "text-gray-300"
          }`}
        />
      )}
      <button
        type="button"
        aria-label={`Move ${folder.name}`}
        title="Drag right by one-third of the name width to nest, or left to move up"
        className="flex size-10 touch-none cursor-grab items-center justify-center rounded-lg text-[color-mix(in_oklab,var(--app-muted)_58%,transparent)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-line)_5%,transparent)] hover:text-[var(--app-primary)] focus-visible:outline-2 focus-visible:outline-[var(--app-primary)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "page" : undefined}
        className={`theme-nav-button flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-1 ${
          selected
            ? "theme-nav-button-active"
            : ""
        }`}
      >
        <span
          className={`h-2 w-2 flex-none rounded-full ${
            folder.color && folder.color !== COLOR_NONE
              ? ""
              : "bg-[var(--app-line)]"
          }`}
          style={{
            backgroundColor:
              folder.color && folder.color !== COLOR_NONE
                ? getColorHex(folder.color)
                : undefined,
          }}
        />
        <span className="min-w-0 flex-1 text-left text-sm">
          <span
            data-folder-name
            className="inline-block max-w-full truncate align-bottom"
          >
            {folder.name}
          </span>
        </span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-sm ${
            selected ? "theme-nav-count-active" : "text-[var(--app-muted)]"
          }`}
        >
          {count}
        </span>
      </button>
    </li>
  );
}

export default function FolderSidebar({
  selectedFolderId,
  onSelectFolder,
  selectedTagId,
  onSelectTag,
  onStartOnboarding,
  onOpenDataTransfer,
}: FolderSidebarProps) {
  const appVersion = changelog[0]?.version ?? PRODUCT_VERSION;
  const { user, signOut } = useAuth();
  const {
    themeVariant,
    themeSaveError,
    setThemeVariant,
    retryThemeSave,
    dismissThemeSaveError,
  } = useTheme();
  const { data: userInfo } = useUserInfo();
  const accountDisplayName = getAccountDisplayName(userInfo, user?.email);
  const { data: accountPlan } = useAccountPlan();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const {
    data: folders = [],
    isLoading: loadingFolders,
    isError: foldersError,
    refetch: retryFolders,
  } = useFolders();
  const { data: folderCounts = {} } = useFolderBookmarkCounts();
  const {
    data: tags = [],
    isLoading: loadingTags,
    isError: tagsError,
    refetch: retryTags,
  } = useTags();
  const { data: tagCounts = {} } = useTagBookmarkCounts();
  const addFolderMutation = useAddFolder();
  const reorderFoldersMutation = useReorderFolders();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newColor, setNewColor] = useState<ColorConstant>(COLOR_NONE);
  const [newParentId, setNewParentId] = useState("");
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [dragIntent, setDragIntent] = useState<FolderDragIntent | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const nestingThresholdRef = useRef(24);
  const { data: bookmarkCounts } = useBookmarkCounts();
  const { data: noteCount = 0 } = useNoteCount();
  const { data: todoCount = 0 } = useTodoCount();
  const { data: readspaceCount = 0 } = useReadspaceCount();
  const { data: listCount = 0 } = useListCount();
  const { data: trashCount = 0 } = useTrashCount();
  const currentTheme =
    THEME_VARIANT_OPTIONS.find((option) => option.value === themeVariant) ??
    THEME_VARIANT_OPTIONS[0];

  const handleCreate = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);

    if (
      accountPlan &&
      accountPlan.limits.collections > 0 &&
      folders.length >= accountPlan.limits.collections
    ) {
      setError(
        `Collection limit reached. You can have at most ${accountPlan.limits.collections} collections.`,
      );
      return;
    }

    try {
      await addFolderMutation.mutateAsync({
        name: newName.trim(),
        color: newColor !== COLOR_NONE ? newColor : null,
        parent_id: newParentId || null,
      });
      setNewName("");
      setNewColor(COLOR_NONE);
      setNewParentId("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const getDragIntent = (
    activeId: string | number,
    overId: string | number | undefined,
    deltaX: number,
  ) =>
    overId === undefined
      ? null
      : resolveFolderDragIntent(
          folders,
          String(activeId),
          String(overId),
          deltaX,
          nestingThresholdRef.current,
        );

  const handleDragMove = ({ active, over, delta }: DragMoveEvent) => {
    setDragIntent(getDragIntent(active.id, over?.id, delta.x));
  };

  const handleDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const intent = getDragIntent(active.id, over?.id, delta.x);
    setDragIntent(null);
    setActiveDragId(null);
    if (!intent) return;
    if (intent.action === "blocked") {
      setReorderError(
        intent.message ?? "That collection cannot be moved there.",
      );
      return;
    }

    const nextFolders = moveFolder(
      folders,
      intent.activeId,
      intent.overId,
      intent.nextParentId,
    );
    const placements = buildFolderPlacements(nextFolders);
    setReorderError(null);
    reorderFoldersMutation.mutate(placements, {
      onError: () => {
        setReorderError("Could not save the collection order. Try again.");
      },
    });
  };

  const dragFeedback = useMemo(() => {
    if (!dragIntent) {
      if (!activeDragId) return null;
      const activeHasChildren = folders.some(
        (folder) => folder.parent_id === activeDragId,
      );
      return activeHasChildren
        ? "This collection has subcollections and can only be reordered"
        : "Move right by ⅓ of its name width to nest · left to move up";
    }
    const activeName =
      folders.find((folder) => folder.id === dragIntent.activeId)?.name ??
      "Collection";

    if (dragIntent.action === "blocked") {
      return dragIntent.message ?? "This move is not allowed.";
    }
    if (dragIntent.action === "unnest") {
      return `Drop to move “${activeName}” to the top level`;
    }
    if (dragIntent.action === "nest") {
      const parentName = folders.find(
        (folder) => folder.id === dragIntent.targetParentId,
      )?.name;
      return `Drop to nest “${activeName}” under “${parentName ?? "collection"}”`;
    }
    return `Drop to reorder “${activeName}”`;
  }, [activeDragId, dragIntent, folders]);

  return (
    <>
      <nav
        className="app-sidebar h-full min-h-0 overflow-y-auto overscroll-contain rounded-[1.4rem]"
        aria-label="Bookmark navigation"
      >
      {/* Library and collections */}
      <div
        className={`p-3 transition-shadow ${
          dragIntent?.action === "unnest" ? "ring-2 ring-sky-400 shadow-sm" : ""
        }`}
      >
        <Link
          to="/"
          aria-label="Go to all items"
          className="mb-3 flex items-center px-1"
        >
          <AppLogo className="my-3 h-9 w-auto" />
        </Link>
        <div className="flex items-center justify-between px-2">
          <h3 className="app-sidebar-label">
            Library
          </h3>
        </div>
        <ul className="mt-2 space-y-1">
          <li>
            <button
              type="button"
              onClick={() => onSelectFolder(null)}
              aria-current={
                location.pathname === "/"
                  ? "page"
                  : undefined
              }
              className={`theme-nav-button w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium ${
                location.pathname === "/"
                  ? "theme-nav-button-active"
                  : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <House size={16} aria-hidden="true" />
                All Items
              </span>
              <span
                className={`text-sm px-1.5 py-0.5 rounded-md ${
                  location.pathname === "/"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {(bookmarkCounts?.bookmarkCount ?? 0) +
                  noteCount +
                  todoCount +
                  readspaceCount}
              </span>
            </button>
          </li>
          <li>
            <Link
              to="/write"
              aria-current={location.pathname === "/write" ? "page" : undefined}
              className={`theme-nav-button flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                location.pathname === "/write" ? "theme-nav-button-active" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <StickyNote size={16} aria-hidden="true" />
                Write
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-sm ${
                  location.pathname === "/write"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {noteCount}
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/tasks"
              aria-current={location.pathname === "/tasks" ? "page" : undefined}
              className={`theme-nav-button flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                location.pathname === "/tasks" ? "theme-nav-button-active" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <ListTodo size={16} aria-hidden="true" />
                Tasks
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-sm ${
                  location.pathname === "/tasks"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {todoCount}
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/readspace"
              aria-current={location.pathname === "/readspace" ? "page" : undefined}
              className={`theme-nav-button flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                location.pathname === "/readspace" ? "theme-nav-button-active" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen size={16} aria-hidden="true" />
                Reading
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-sm ${
                  location.pathname === "/readspace"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {readspaceCount}
              </span>
            </Link>
          </li>
          <li>
            <Link
              to="/lists"
              aria-current={location.pathname === "/lists" ? "page" : undefined}
              className={`theme-nav-button flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                location.pathname === "/lists" ? "theme-nav-button-active" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <ListChecks size={16} aria-hidden="true" />
                Lists
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-sm ${
                  location.pathname === "/lists"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {listCount}
              </span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onSelectFolder("favorites")}
              aria-current={
                selectedFolderId === "favorites" ? "page" : undefined
              }
              className={`theme-nav-button w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg group ${
                selectedFolderId === "favorites"
                  ? "theme-nav-button-active"
                  : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <Heart
                  size={16}
                  className="group-hover:text-red-500 transition-colors"
                  aria-hidden="true"
                />
                Favorites
              </span>
              <span
                className={`text-sm px-1.5 py-0.5 rounded-md ${
                  selectedFolderId === "favorites"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {bookmarkCounts?.favoriteCount ?? 0}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => onSelectFolder("unsorted")}
              aria-current={
                selectedFolderId === "unsorted" ? "page" : undefined
              }
              className={`theme-nav-button w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg ${
                selectedFolderId === "unsorted"
                  ? "theme-nav-button-active"
                  : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <Archive size={16} aria-hidden="true" />
                Unsorted
              </span>
              <span
                className={`text-sm px-1.5 py-0.5 rounded-md ${
                  selectedFolderId === "unsorted"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {bookmarkCounts?.unsortedCount ?? 0}
              </span>
            </button>
          </li>
          <li>
            <Link
              to="/trash"
              aria-current={location.pathname === "/trash" ? "page" : undefined}
              className={`theme-nav-button flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-medium ${
                location.pathname === "/trash" ? "theme-nav-button-active" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <Trash2 size={16} aria-hidden="true" />
                Trash
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-sm ${
                  location.pathname === "/trash"
                    ? "theme-nav-count-active"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {trashCount}
              </span>
            </Link>
          </li>
        </ul>
        <div
          className="my-3 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)]"
          role="separator"
          aria-label="User collections"
        />

        <div className="flex items-center justify-between px-2">
          <h3 className="app-sidebar-label">Collections</h3>
          <button
            type="button"
            onClick={() => setCreating(!creating)}
            className="theme-button-icon inline-flex size-10"
            aria-label="Create collection"
            aria-expanded={creating}
          >
            <PlusIcon size={16} aria-hidden="true" />
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="mt-2 space-y-2">
            <input
              type="text"
              aria-label="Collection name"
              placeholder="Collection name"
              value={newName}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNewName(e.target.value)
              }
              autoFocus
              className="min-h-11 w-full rounded-lg border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white px-3 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                  setNewColor(COLOR_NONE);
                  setNewParentId("");
                }
              }}
            />
            <details className="rounded-lg border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/45 px-2.5 py-2 text-sm text-[var(--app-muted)]">
              <summary className="cursor-pointer select-none font-medium text-[var(--app-ink)]">
                More options
              </summary>
              <div className="mt-2 space-y-2">
                {folders.some((folder) => folder.parent_id === null) && (
                  <select
                    value={newParentId}
                    onChange={(event) => setNewParentId(event.target.value)}
                    aria-label="Parent collection"
                    className="min-h-10 w-full rounded-lg border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white px-2.5 text-sm text-[var(--app-ink)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
                  >
                    <option value="">Top-level collection</option>
                    {folders
                      .filter((folder) => folder.parent_id === null)
                      .map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          Subcollection of {folder.name}
                        </option>
                      ))}
                  </select>
                )}
                <fieldset>
                  <legend className="mb-1.5 text-xs font-medium">
                    Collection color
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={`size-8 cursor-pointer rounded-full border-2 transition-all ${
                          newColor === c
                            ? "scale-110 border-[var(--app-ink)]"
                            : "border-[color-mix(in_oklab,var(--app-line)_24%,transparent)] hover:border-[var(--app-primary)]"
                        } ${c === COLOR_NONE ? "bg-[var(--app-line)]" : ""}`}
                        style={{
                          backgroundColor:
                            c === COLOR_NONE ? undefined : getDisplayColor(c),
                        }}
                        title={c === COLOR_NONE ? "No color" : c}
                        aria-label={c === COLOR_NONE ? "No color" : `${c} color`}
                        aria-pressed={newColor === c}
                      />
                    ))}
                  </div>
                </fieldset>
              </div>
            </details>
            <div className="flex gap-2">
              <Button
                type="button"
                outline
                className="flex-1"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewColor(COLOR_NONE);
                  setNewParentId("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="emerald"
                className="flex-1"
              >
                Create
              </Button>
            </div>
            {error && (
              <p className="text-sm text-red-500 " role="alert">
                {error}
              </p>
            )}
          </form>
        )}

        {loadingFolders ? (
          <FolderSidebarSkeleton />
        ) : foldersError ? (
          <div
            className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600"
            role="alert"
          >
            <p>Could not load collections.</p>
            <button
              type="button"
              className="mt-1 font-semibold underline underline-offset-2"
              onClick={() => void retryFolders()}
            >
              Try again
            </button>
          </div>
        ) : folders.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={folderCollisionDetection}
            onDragStart={({ active }) => {
              const activeId = String(active.id);
              const nameElement = document.querySelector<HTMLElement>(
                `[data-folder-id="${activeId}"] [data-folder-name]`,
              );
              nestingThresholdRef.current = Math.max(
                1,
                (nameElement?.getBoundingClientRect().width ?? 72) / 3,
              );
              setActiveDragId(activeId);
              setDragIntent(null);
              setReorderError(null);
            }}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setDragIntent(null);
              setActiveDragId(null);
            }}
          >
            <SortableContext
              items={folders.map((folder) => folder.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="mt-2 space-y-0.5">
                {folders.map((folder) => (
                  <SortableCollection
                    key={folder.id}
                    folder={folder}
                    count={folderCounts[folder.id] ?? 0}
                    selected={selectedFolderId === folder.id}
                    onSelect={() => onSelectFolder(folder.id)}
                    previewDepth={
                      dragIntent?.activeId === folder.id
                        ? dragIntent.action === "nest"
                          ? 1
                          : dragIntent.action === "unnest"
                            ? 0
                            : undefined
                        : undefined
                    }
                    isNestTarget={
                      dragIntent?.action === "nest" &&
                      dragIntent.targetParentId === folder.id
                    }
                    isBlocked={
                      dragIntent?.action === "blocked" &&
                      dragIntent.activeId === folder.id
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : null}
        {folders.length > 1 && (
          <p
            className={`mt-2 min-h-4 px-1 text-xs font-medium transition-colors ${
              dragIntent?.action === "nest"
                ? "text-emerald-600"
                : dragIntent?.action === "unnest"
                  ? "text-sky-600"
                  : dragIntent?.action === "blocked"
                    ? "text-red-600"
                    : "text-gray-400"
            }`}
            role="status"
            aria-live="polite"
          >
            {dragFeedback ?? "Drag right to nest · left to move up"}
          </p>
        )}
        {reorderError && (
          <p className="mt-2 text-sm text-red-500" role="alert">
            {reorderError}
          </p>
        )}
      </div>

      {/* Tags */}
      <div className="border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] p-3">
        <div className="flex items-center justify-between">
          <h3 className="app-sidebar-label px-2">
            Tags
          </h3>
        </div>

        {loadingTags ? (
          <div className="mt-2 space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 rounded-lg liquid-skeleton" />
            ))}
          </div>
        ) : tagsError ? (
          <div
            className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600"
            role="alert"
          >
            <p>Could not load tags.</p>
            <button
              type="button"
              className="mt-1 font-semibold underline underline-offset-2"
              onClick={() => void retryTags()}
            >
              Try again
            </button>
          </div>
        ) : tags.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {tags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => onSelectTag?.(tag.id)}
                  aria-current={selectedTagId === tag.id ? "page" : undefined}
                  className={`theme-nav-button w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${
                    selectedTagId === tag.id
                      ? "theme-nav-button-active"
                      : ""
                  }`}
                >
                  <Tag size={14} className="flex-none" aria-hidden="true" />
                  <span className="flex-1 text-left truncate text-sm">
                    {tag.name}
                  </span>
                  <span
                    className={`text-sm px-1.5 py-0.5 rounded-md ${
                      selectedTagId === tag.id
                        ? "theme-nav-count-active"
                        : "text-[var(--app-muted)]"
                    }`}
                  >
                    {tagCounts[tag.id] ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {accountPlan?.id === "free" ? (
        <div className="border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] p-3">
          <button
            type="button"
            onClick={() => setUpgradeDialogOpen(true)}
            className="group flex w-full items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--app-primary)_28%,transparent)] bg-gradient-to-r from-[color-mix(in_oklab,var(--app-primary)_13%,var(--app-card))] to-[color-mix(in_oklab,var(--app-card-strong)_55%,var(--app-card))] px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]"
            aria-label="Upgrade to FavLock Pro"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-primary)] text-white shadow-md shadow-[color-mix(in_oklab,var(--app-primary)_20%,transparent)]">
              <Sparkles size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--app-ink)]">
              Upgrade to Pro
            </span>
            <ArrowRight
              size={15}
              className="shrink-0 text-[var(--app-primary)] transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
      ) : null}

      {/* User & Settings */}
      <details className="group border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)]">
        {/* User Profile Card */}
        <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="size-8 rounded-xl bg-[var(--app-primary)] flex items-center justify-center text-white font-semibold text-sm shadow-md shadow-[color-mix(in_oklab,var(--app-primary)_20%,transparent)]">
                {accountDisplayName[0]?.toUpperCase() ?? "U"}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--app-ink)]">
                  {accountDisplayName}
                </p>
                {accountPlan ? (
                  <span
                    className="shrink-0 rounded-full border border-[color-mix(in_oklab,var(--app-primary)_25%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold leading-none text-[var(--app-primary)]"
                    aria-label={`${accountPlan.name} plan`}
                  >
                    {accountPlan.name}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-[var(--app-muted)]">
                {user?.email}
              </p>
            </div>
            <ChevronDown
              size={16}
              className="flex-none text-[var(--app-muted)] transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </div>
        </summary>

        <div className="mx-3 h-px bg-[color-mix(in_oklab,var(--app-line)_9%,transparent)]" />

        {/* Actions */}
        <div className="p-2">
          <Dropdown>
            <DropdownButton
              plain
              className="theme-nav-button w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
            >
              <Palette size={16} />
              <span className="text-sm flex-1 text-left">
                {currentTheme.label}
              </span>
            </DropdownButton>
            <DropdownMenu anchor="bottom start" className="min-w-64">
              {THEME_VARIANT_OPTIONS.map((option) => (
                <DropdownItem
                  key={option.value}
                  className="gap-2"
                  onClick={() => setThemeVariant(option.value)}
                >
                  <span className="min-w-0 flex-1 text-left text-sm font-medium text-zinc-950">
                    {option.label}
                  </span>
                  {themeVariant === option.value && (
                    <Check className="size-4 text-[var(--app-primary)]" />
                  )}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {themeSaveError ? (
            <div
              className="mx-1 mt-1 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-600"
              role="alert"
            >
              <p>{themeSaveError}</p>
              <div className="mt-1 flex gap-3 font-semibold">
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={retryThemeSave}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={dismissThemeSaveError}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <Link
            to="/settings"
            aria-current={location.pathname === "/settings" ? "page" : undefined}
            className={`mt-0.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
              location.pathname === "/settings"
                ? "theme-nav-button-active"
                : "theme-nav-button"
            }`}
          >
            <SettingsIcon size={16} />
            <span className="text-sm flex-1 text-left">Settings</span>
          </Link>

          <button
            type="button"
            onClick={onOpenDataTransfer}
            className="theme-nav-button w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          >
            <ArrowDownUp size={16} aria-hidden="true" />
            <span className="text-sm flex-1 text-left">Data transfer</span>
          </button>

          <Link
            to="/support"
            aria-current={location.pathname === "/support" ? "page" : undefined}
            className="theme-nav-button w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          >
            <LifeBuoy size={16} />
            <span className="text-sm flex-1 text-left">Support</span>
          </Link>

          <button
            type="button"
            onClick={onStartOnboarding}
            className="theme-nav-button w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          >
            <CircleHelp size={16} aria-hidden="true" />
            <span className="text-sm flex-1 text-left">Getting started</span>
          </button>
        </div>

        <div className="mx-3 h-px bg-[color-mix(in_oklab,var(--app-line)_9%,transparent)]" />

        {/* Sign Out */}
        <div className="p-2">
          <button
            onClick={async () => {
              setSigningOut(true);
              await signOut();
            }}
            disabled={signingOut}
            className="theme-nav-button theme-danger-button w-full group flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200"
          >
            <div className="size-7 rounded-lg bg-[color-mix(in_oklab,var(--app-line)_7%,var(--app-card))] group-hover:bg-red-100 flex items-center justify-center transition-all duration-200">
              <LogOutIcon
                size={16}
                className={`transition-all duration-200 ${signingOut ? "animate-pulse" : "group-hover:translate-x-0.5"}`}
              />
            </div>
            <span className="text-sm font-medium">
              {signingOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      </details>

      <div className="border-t border-[color-mix(in_oklab,var(--app-line)_9%,transparent)] px-3 py-3 text-center text-xs text-[var(--app-muted)]">
        © {new Date().getFullYear()} FavLock · v{appVersion}
      </div>
      </nav>
      <ProUpgradeDialog
        open={upgradeDialogOpen}
        onClose={() => setUpgradeDialogOpen(false)}
      />
    </>
  );
}
