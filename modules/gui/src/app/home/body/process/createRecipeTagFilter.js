/**
 * Recipe type tag filter for the "Add recipe" panel.
 * A null tagFilter means "ALL" (no restriction).
 * Selection is single-value (radio), not multi-select AND.
 */
export const recipeTypeMatchesTagFilter = (recipeType, tagFilter) =>
    tagFilter == null || Boolean(recipeType?.tags?.includes(tagFilter))
