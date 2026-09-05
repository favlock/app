import { act, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FavLockExport } from "../lib/dataExport";
import {
  markLocalVaultCloudMergeAdopting,
  markLocalVaultCloudMergeCompleted,
  startLocalVaultCloudMerge,
} from "../lib/localVaultCloudMerge";
import LocalVaultCloudMergeDialog from "./LocalVaultCloudMergeDialog";

const sourceVaultId = "11111111-1111-4111-8111-111111111111";
const recoveryKey = "1234 5678 9012 3456 7890 1234 5678 9012";
const archive: FavLockExport = {
  format: "favlock-export",
  version: 2,
  exportedAt: "2026-09-02T10:00:00.000Z",
  encrypted: false,
  selection: { bookmarks: true, notes: false, todos: false, readspace: false },
  data: {
    collections: [],
    tags: [],
    bookmarks: [{
      id: "22222222-2222-4222-8222-222222222222",
      title: "Local bookmark",
      url: "https://example.com/",
      collectionIds: [],
      tagIds: [],
      isFavorite: false,
      favoritedAt: null,
      createdAt: "2026-09-02T10:00:00.000Z",
    }],
    lists: [],
    notes: [],
    todos: [],
    readspace: [],
  },
};

const completeArchive: FavLockExport = {
  ...archive,
  selection: { bookmarks: true, notes: true, todos: true, readspace: true },
  data: {
    ...archive.data,
    bookmarks: [],
    lists: [{
      id: "33333333-3333-4333-8333-333333333333",
      name: "Local List",
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
      items: [],
    }],
    notes: [{
      id: "44444444-4444-4444-8444-444444444444",
      title: "Local document",
      content: "Document body",
      collectionId: null,
      tagIds: [],
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    }],
    todos: [{
      id: "55555555-5555-4555-8555-555555555555",
      title: "Local task",
      content: "Task body",
      collectionId: null,
      tagIds: [],
      isCompleted: false,
      completedAt: null,
      dueDate: null,
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    }],
    readspace: [{
      id: "66666666-6666-4666-8666-666666666666",
      title: "Local article",
      content: "Article body",
      collectionId: null,
      tagIds: [],
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    }],
  },
};

const mocks = vi.hoisted(() => ({
  adoptMigratedKey: vi.fn(),
  buildArchive: vi.fn(),
  inspectDestination: vi.fn(),
  matchesLocalKey: vi.fn(),
  mergeArchive: vi.fn(),
  migrateArchive: vi.fn(),
  retrySync: vi.fn(),
  setRawKey: vi.fn(),
  triggerUnlock: vi.fn(),
  cryptoKey: null as CryptoKey | null,
  user: {
    id: "cloud-user",
    email: "cloud@example.com",
    user_metadata: {},
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("./ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement> & {
    color?: string;
    outline?: boolean;
    plain?: boolean;
  }) => {
    const buttonProps = { ...props };
    delete buttonProps.color;
    delete buttonProps.outline;
    delete buttonProps.plain;
    return <button {...buttonProps} />;
  },
}));

vi.mock("./ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("./ui/fieldset", () => ({
  Description: (props: HTMLAttributes<HTMLParagraphElement>) => <p {...props} />,
  Field: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  Label: (props: LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} />,
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "current.jwt.token" },
    user: mocks.user,
    isLocalAccount: false,
    retryBookmarkCacheSync: mocks.retrySync,
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    adoptMigratedKey: mocks.adoptMigratedKey,
    cryptoKey: mocks.cryptoKey,
    setRawKey: mocks.setRawKey,
    triggerUnlock: mocks.triggerUnlock,
  }),
}));

vi.mock("../lib/localVaultCloudMerge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/localVaultCloudMerge")>()),
  buildLocalVaultMergeArchive: mocks.buildArchive,
  inspectLocalVaultCloudDestination: mocks.inspectDestination,
}));

vi.mock("../lib/localKeyVerifier", () => ({
  clearLocalKeyVerifier: vi.fn(),
  matchesLocalKey: mocks.matchesLocalKey,
}));

vi.mock("../lib/localVault", () => ({
  clearLocalVault: vi.fn(),
  readLocalPasskeyRecord: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/libraryMigrationApi", () => ({
  mergeFavLockArchive: mocks.mergeArchive,
  migrateFavLockArchive: mocks.migrateArchive,
}));

describe("LocalVaultCloudMergeDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.adoptMigratedKey.mockResolvedValue(true);
    mocks.buildArchive.mockResolvedValue(archive);
    mocks.inspectDestination.mockResolvedValue("empty");
    mocks.matchesLocalKey.mockResolvedValue(true);
    mocks.mergeArchive.mockResolvedValue(undefined);
    mocks.migrateArchive.mockResolvedValue(undefined);
    mocks.cryptoKey = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("adopts the local key when the authenticated account is empty", async () => {
    const intent = startLocalVaultCloudMerge(sourceVaultId);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalVaultCloudMergeDialog />
        </QueryClientProvider>,
      );
    });

    const input = document.querySelector<HTMLInputElement>(
      "#local-merge-recovery-key",
    );
    expect(input).not.toBeNull();
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setInputValue.call(input, recoveryKey);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const connect = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Connect to this account"),
    );
    expect(connect).toBeDefined();
    expect(connect!.disabled).toBe(false);
    await act(async () => {
      connect!.click();
    });

    await vi.waitFor(() => expect(mocks.migrateArchive).toHaveBeenCalled());
    const sourceKey = mocks.migrateArchive.mock.calls[0][2] as CryptoKey;
    expect(mocks.migrateArchive).toHaveBeenCalledWith(
      archive,
      "current.jwt.token",
      sourceKey,
      expect.any(Function),
      intent.migrationId,
    );
    expect(mocks.adoptMigratedKey).toHaveBeenCalledWith(sourceKey, {
      rememberDevice: true,
    });
    expect(document.body.textContent).toContain(
      "Your existing local recovery key remains valid",
    );
    expect(document.body.textContent).toContain("Create a cloud passkey");
  });

  it("restores the completed success state after the dashboard remounts", async () => {
    const intent = markLocalVaultCloudMergeAdopting(
      startLocalVaultCloudMerge(sourceVaultId),
    );
    markLocalVaultCloudMergeCompleted(intent, true);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalVaultCloudMergeDialog />
        </QueryClientProvider>,
      );
    });

    expect(document.body.textContent).toContain("Local vault connected");
    expect(document.body.textContent).toContain(
      "Your existing local recovery key remains valid",
    );
    expect(document.querySelector("#local-merge-recovery-key")).toBeNull();
  });

  it("merges Lists and every local entry category into an existing cloud vault", async () => {
    const intent = startLocalVaultCloudMerge(sourceVaultId);
    const destinationKey = { type: "secret" } as CryptoKey;
    mocks.buildArchive.mockResolvedValue(completeArchive);
    mocks.inspectDestination.mockResolvedValue("different-key");
    mocks.cryptoKey = destinationKey;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalVaultCloudMergeDialog />
        </QueryClientProvider>,
      );
    });

    const input = document.querySelector<HTMLInputElement>(
      "#local-merge-recovery-key",
    );
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setInputValue.call(input, recoveryKey);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const connect = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Connect to this account"),
    );
    await act(async () => {
      connect!.click();
    });

    await vi.waitFor(() => expect(mocks.mergeArchive).toHaveBeenCalledWith(
      completeArchive,
      "current.jwt.token",
      destinationKey,
      expect.any(Function),
      intent.migrationId,
    ));
    expect(document.body.textContent).toContain("Local vault connected");
  });
});
