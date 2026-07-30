// GUI-side sampling-grid validator for the Stratification panel. Stratification owns Scale (numeric, positive);
// the equal-area CRS is a curated selection owned by Sample Arrangement. There is no user-facing transform.
export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0
