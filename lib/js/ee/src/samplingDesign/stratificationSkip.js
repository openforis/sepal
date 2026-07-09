// Stratification skip has existed both as a boolean model field and as the old form-toggle shape (a
// non-empty array). Keep the predicate shared so export routing, area injection and stratification image
// loading cannot drift.
export const isStratificationSkipped = stratification =>
    stratification?.skip === true || (Array.isArray(stratification?.skip) && stratification.skip.length > 0)
