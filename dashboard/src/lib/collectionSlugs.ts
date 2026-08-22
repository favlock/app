type NamedEntity = {
  id: string;
  name: string;
};

const FALLBACK_COLLECTION_SLUG = "collection";

const toBaseCollectionSlug = (name: string) => {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || FALLBACK_COLLECTION_SLUG;
};

const buildSlugIndex = (entities: NamedEntity[]) => {
  const slugById = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  const slugCounts = new Map<string, number>();

  const orderedEntities = [...entities].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );

  for (const entity of orderedEntities) {
    const baseSlug = toBaseCollectionSlug(entity.name);
    const slugCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, slugCount);

    const slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`;
    slugById.set(entity.id, slug);
    idBySlug.set(slug, entity.id);
  }

  return { slugById, idBySlug };
};

export const buildCollectionSlugIndex = (collections: NamedEntity[]) =>
  buildSlugIndex(collections);

export const buildTagSlugIndex = (tags: NamedEntity[]) => buildSlugIndex(tags);
