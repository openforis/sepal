// The sampling-grid geometry rules, defined once for the GUI panels, the task boundary and the EE layer
// (`#sepal/recipe/samplingDesign/samplingGrid` resolves here from modules/gui, modules/task and modules/gee).
// Pure numbers and strings only - no EE, no GUI - so every layer parses a grid the same way.

// EE's 6-number affine transform form, as stored in the recipe. Returns the parsed numbers, or null when the
// value is absent or not six finite numbers.
export const parseCrsTransform = crsTransform => {
    const parts = Array.isArray(crsTransform)
        ? crsTransform.map(Number)
        : typeof crsTransform === 'string' && crsTransform.trim()
            ? crsTransform.replace(/[[\]]/g, '').split(',').map(part => Number(part.trim()))
            : []
    return parts.length === 6 && parts.every(Number.isFinite) ? parts : null
}

// North-up, axis-aligned, square, non-zero: no shear (b=d=0), east-positive (a>0), north-up (e<0), square (a=-e).
export const isAxisAlignedTransform = transform =>
    Array.isArray(transform) && transform.length === 6
        && transform[1] === 0 && transform[3] === 0
        && transform[0] > 0 && transform[4] < 0 && transform[0] === -transform[4]

// Grid pixel size in metres: the transform's pixel width when transform-defined, otherwise the scale.
export const gridPixelSize = ({scale, crsTransform} = {}) => {
    const transform = parseCrsTransform(crsTransform)
    return transform ? Math.abs(transform[0]) : Number(scale)
}

// The raster spacing floor. A stratified systematic lattice is placed on the stratification grid, so two
// samples can never be closer than two grid pixels - the candidate generator clamps to this internally, which
// would silently override a smaller configured distance. Callers validate against it instead, so the user sees
// the real constraint rather than a quietly rewritten value.
//
// APPLICABILITY IS THE CALLER'S DECISION: this floor holds only for STRATIFIED SYSTEMATIC sampling. Unstratified
// systematic sampling is analytical (spacing comes from minDistance alone, not a raster grid) and random
// sampling has no minimum distance at all - neither may be validated against this.
export const requiredMinDistance = grid => {
    const pixelSize = gridPixelSize(grid)
    return Number.isFinite(pixelSize) && pixelSize > 0
        ? 2 * pixelSize
        : null
}

// Whether a configured distance satisfies the raster floor for this grid. An indeterminate grid (no valid scale
// or transform) yields true: the grid-definition error reports that instead, so one bad grid raises one error.
export const isValidMinDistanceForGrid = ({minDistance, ...grid} = {}) => {
    const required = requiredMinDistance(grid)
    if (required === null) {
        return true
    }
    const distance = Number(minDistance)
    return Number.isFinite(distance) && distance >= required
}
