// GUI-side sampling-grid validator for the Stratification panel: Scale must be numeric and positive. There is
// no user-facing transform.
export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0
