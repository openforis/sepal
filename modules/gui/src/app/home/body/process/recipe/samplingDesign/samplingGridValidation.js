import {isAxisAlignedTransform, parseCrsTransform} from '#sepal/recipe/samplingDesign/samplingGrid'

// GUI-side sampling-grid validators for the Stratification panel.

// Scale must be numeric and positive.
export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0

// The CRS transform is OPTIONAL - blank is valid - and when present it REPLACES Scale, so it must fully define
// the grid: six finite numbers, north-up, square and unrotated. One definition, called by both the form field's
// predicate and the panel's inline error, so the two can never drift apart.
export const isValidStratificationTransform = value =>
    !value || !String(value).trim()
        ? true
        : isAxisAlignedTransform(parseCrsTransform(value))
