// The sampling-grid geometry rules, defined once for the GUI panels, the task boundary and the EE layer
// (`#sepal/recipe/samplingDesign/samplingGrid` resolves here from modules/gui, modules/task and modules/gee).
// Pure numbers and strings only - no EE, no GUI - so every layer parses a grid the same way.

// Distances are metres derived from a grid size, so trim floating-point noise (0.30000000000000004 -> 0.3)
// without imposing a fixed number of decimals.
export const formatDistance = value => Number(Number(value).toFixed(4))

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

// Minimum distance is OPTIONAL. Leaving it unset means "use the closest spacing the grid allows", which
// resolveMinDistance below turns into the floor - so nothing is persisted and the value tracks the grid.
export const isMinDistanceUnset = minDistance =>
    minDistance == null || String(minDistance).trim() === ''

// Whether a configured distance satisfies the raster floor for this grid. Unset is valid (it resolves to the
// floor). An indeterminate grid (no valid scale or transform) is also valid here: the grid-definition error
// reports that instead, so one bad grid raises one error.
export const isValidMinDistanceForGrid = ({minDistance, ...grid} = {}) => {
    const required = requiredMinDistance(grid)
    if (required === null || isMinDistanceUnset(minDistance)) {
        return true
    }
    const distance = Number(minDistance)
    return Number.isFinite(distance) && distance >= required
}

// The distance the draw actually uses. Unset resolves to the grid's floor, so nothing has to be persisted and
// the value tracks the grid. An explicit value is returned UNCHANGED - never clamped - so a below-floor entry
// stays visible to validation instead of being silently corrected into a valid-looking design.
export const resolveMinDistance = ({minDistance, ...grid} = {}) =>
    isMinDistanceUnset(minDistance)
        ? requiredMinDistance(grid)
        : Number(minDistance)
