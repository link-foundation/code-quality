const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// This is a view of already verified pairs, bounded by their result limit.
// It does not infer additional matches, change findings or execute source.
export function groupTokenClones(clones) {
  const groups = new Map();
  for (const { language, tokens, signature, first, second } of clones) {
    const key = JSON.stringify([language, tokens, signature]);
    if (!groups.has(key)) {
      groups.set(key, { language, tokens, signature, locations: new Map() });
    }
    const { locations } = groups.get(key);
    for (const entry of [first, second]) {
      const identity = JSON.stringify([entry.path, entry.start, entry.end]);
      locations.set(identity, { ...entry });
    }
  }
  return [...groups.values()]
    .map(({ locations, ...group }) => ({
      ...group,
      occurrences: [...locations.values()].sort(
        (a, b) => compare(a.path, b.path) || a.start - b.start || a.end - b.end
      ),
    }))
    .sort(
      (a, b) =>
        b.tokens - a.tokens ||
        compare(a.language, b.language) ||
        compare(a.signature, b.signature)
    );
}
