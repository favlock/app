export function getUnmatchedHighlightNotice(result) {
  if (
    !result
    || !Number.isSafeInteger(result.matched)
    || !Number.isSafeInteger(result.total)
    || result.matched < 0
    || result.total < result.matched
  ) return null;

  const unmatched = result.total - result.matched;
  if (!unmatched) return null;
  return unmatched === 1
    ? "FavLock couldn’t place 1 saved highlight. The page may have changed. It remains available in Readspace."
    : `FavLock couldn’t place ${unmatched} saved highlights. The page may have changed. They remain available in Readspace.`;
}
