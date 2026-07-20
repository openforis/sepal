import {isAxisAlignedTransform, parseCrsTransform} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {ClientException} from '#sepal/exception'
import {gridPixelSize, isValidMinDistanceForGrid, requiredMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {isSupportedSamplingGridCrs, supportedSamplingGridCrsNames} from '#sepal/recipe/samplingDesign/samplingGridCrs'

const UNSUPPORTED_CRS = 'The selected sampling grid is not supported. Choose one of: {supported}.'
const INVALID_TRANSFORM = 'The sampling grid transform is invalid. A grid transform must be north-up, axis-aligned, square and non-zero, and cannot be combined with a scale. Provide a valid transform or use a scale instead.'
const INVALID_SCALE = 'The sampling grid scale is invalid. Provide a positive scale in metres, or a valid grid transform instead.'
const MIN_DISTANCE_BELOW_GRID = 'Minimum distance must be at least {minimum} m for the current {pixelSize} m stratification grid. Increase Minimum distance, or use a finer Scale in Stratification.'

const structured = ({key, message, args = {}}) => {
    const resolved = Object.keys(args).reduce((text, name) => text.replace(`{${name}}`, args[name]), message)
    return new ClientException(resolved, {userMessage: {key, message, args}})
}

// Task-boundary validation of the stratified systematic sampling grid. Synchronous (no EE): the copy/pastable
// candidate function stays projection-agnostic, so the CRS/grid contract is enforced HERE, before the EE graph is
// built - recipes can arrive through non-GUI paths, so a GUI restriction alone is insufficient. Requires EXACTLY
// one valid grid definition: a positive finite scale (metres), OR a north-up, axis-aligned, square, non-zero
// transform - never both, and never neither. Returns a structured, actionable ClientException, or null when valid.
export const unsupportedCrsError = crs =>
    isSupportedSamplingGridCrs(crs)
        ? null
        : structured({
            key: 'tasks.samplingDesign.systematic.grid.unsupportedCrs',
            message: UNSUPPORTED_CRS,
            // Concise option names only - never the full WKT.
            args: {supported: supportedSamplingGridCrsNames().join(', ')}
        })

export const stratifiedGridError = ({crs, scale, crsTransform} = {}) => {
    const crsError = unsupportedCrsError(crs)
    if (crsError) {
        return crsError
    }
    const invalidTransform = () => structured({key: 'tasks.samplingDesign.systematic.grid.invalidTransform', message: INVALID_TRANSFORM})
    const invalidScale = () => structured({key: 'tasks.samplingDesign.systematic.grid.invalidScale', message: INVALID_SCALE})

    const hasScaleText = scale != null && scale !== ''
    const hasTransformText = crsTransform != null && String(crsTransform).trim() !== ''

    if (hasTransformText) {
        // Transform-defined grid: mutually exclusive with scale, and must be a valid north-up square transform.
        if (hasScaleText) {
            return invalidTransform()
        }
        const transform = parseCrsTransform(crsTransform)
        return transform && isAxisAlignedTransform(transform) ? null : invalidTransform()
    }
    // Scale-defined grid: exactly one positive, finite scale.
    const scaleNumber = Number(scale)
    return hasScaleText && Number.isFinite(scaleNumber) && scaleNumber > 0 ? null : invalidScale()
}

// Unstratified systematic sampling is analytical: spacing comes from minDistance, not a raster grid. It needs a
// supported CRS and allows an optional valid transform, but must never be rejected for lacking a scale.
export const unstratifiedSystematicGridError = ({crs, crsTransform} = {}) => {
    const crsError = unsupportedCrsError(crs)
    if (crsError) {
        return crsError
    }
    if (crsTransform == null || String(crsTransform).trim() === '') {
        return null
    }
    const transform = parseCrsTransform(crsTransform)
    return transform && isAxisAlignedTransform(transform)
        ? null
        : structured({key: 'tasks.samplingDesign.systematic.grid.invalidTransform', message: INVALID_TRANSFORM})
}

// Stratified systematic sampling places its lattice on the stratification grid, so samples can never be closer
// than two grid pixels. Kept SEPARATE from the grid-definition errors above: random sampling validates its grid
// with those but has no minimum distance, and unstratified systematic is analytical, so neither may be checked
// against the raster floor. Run this only for stratified systematic recipes, after the grid itself is valid.
export const stratifiedMinDistanceError = ({minDistance, scale, crsTransform} = {}) => {
    const grid = {scale, crsTransform}
    if (isValidMinDistanceForGrid({minDistance, ...grid})) {
        return null
    }
    return structured({
        key: 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid',
        message: MIN_DISTANCE_BELOW_GRID,
        args: {minimum: requiredMinDistance(grid), pixelSize: gridPixelSize(grid)}
    })
}
