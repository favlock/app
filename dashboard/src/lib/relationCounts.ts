export function countRelations(
  relationIds: Array<string | null | undefined>,
): Record<string, number> {
  return relationIds.reduce<Record<string, number>>((counts, relationId) => {
    if (!relationId) return counts;
    counts[relationId] = (counts[relationId] ?? 0) + 1;
    return counts;
  }, {});
}
