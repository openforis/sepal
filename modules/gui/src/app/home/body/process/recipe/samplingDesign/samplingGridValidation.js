// Single GUI-side sampling-grid validator shared by the Stratification and Sample Arrangement panels, so both
// enforce the same grid contract the task boundary enforces (samplingGridValidation.js in modules/task). The
// exact-first lattice needs a north-up, square affine: a > 0, e < 0, b = d = 0, a = -e. An empty transform is
// valid (no transform supplied); the scale then defines the grid and must be numeric and positive.
export const isValidGridTransform = value => {
    if (!value || !String(value).trim()) {
        return true
    }
    const parts = String(value).replace(/[[\]]/g, '').split(',').map(part => Number(part.trim()))
    const [a, b, , d, e] = parts
    return parts.length === 6 && parts.every(Number.isFinite)
        && b === 0 && d === 0 && a > 0 && e < 0 && a === -e
}

export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0
