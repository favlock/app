const activeImports = new Set<string>();

type NavigatorWithLocks = Navigator & {
  locks?: {
    request<T>(
      name: string,
      options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: unknown | null) => Promise<T>,
    ): Promise<T>;
  };
};

export async function withBrowserBookmarkImportLock<T>(
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const name = `favlock:bookmark-import:${userId}`;
  const locks = (navigator as NavigatorWithLocks).locks;
  if (locks) {
    return locks.request(
      name,
      { ifAvailable: true, mode: "exclusive" },
      async (lock) => {
        if (!lock) {
          throw new Error(
            "Another bookmark import is already running for this account in this browser.",
          );
        }
        return work();
      },
    );
  }

  if (activeImports.has(name)) {
    throw new Error(
      "Another bookmark import is already running for this account in this browser.",
    );
  }
  activeImports.add(name);
  try {
    return await work();
  } finally {
    activeImports.delete(name);
  }
}
