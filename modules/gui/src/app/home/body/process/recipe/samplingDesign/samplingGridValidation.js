import {isAxisAlignedTransform, parseCrsTransform} from '#sepal/recipe/samplingDesign/samplingGrid'

// GUI-side sampling-grid validators used by the Stratification and Sample Arrangement panels. The parsing and
// axis-alignment rules come from the shared recipe policy, so the panels, the task boundary and the EE layer
// cannot disagree about what a grid is. An empty transform is valid (no transform supplied); the scale then
// defines the grid and must be numeric and positive.
export const isValidGridTransform = value =>
    !value || !String(value).trim()
        ? true
        : isAxisAlignedTransform(parseCrsTransform(value))

export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0
