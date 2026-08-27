const epochs = new Map<string, number>();
const pending = new Map<string, Set<Promise<unknown>>>();

export function captureLocalVaultWork(userId: string): () => void {
  const epoch = epochs.get(userId) ?? 0;
  return () => {
    if ((epochs.get(userId) ?? 0) !== epoch) throw new Error("Local vault work was cancelled.");
  };
}

export function trackLocalVaultWork<T>(userId: string, work: Promise<T>): Promise<T> {
  const tasks = pending.get(userId) ?? new Set();
  pending.set(userId, tasks);
  tasks.add(work);
  const cleanup = () => {
    tasks.delete(work);
    if (!tasks.size) pending.delete(userId);
  };
  void work.then(cleanup, cleanup);
  return work;
}

export async function cancelLocalVaultWork(userId: string): Promise<void> {
  epochs.set(userId, (epochs.get(userId) ?? 0) + 1);
  await Promise.allSettled([...(pending.get(userId) ?? [])]);
}
