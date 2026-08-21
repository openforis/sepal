import {ClientException} from '#sepal/exception'
import {formatDistance, gridPixelSize, isAxisAlignedTransform, isMinDistanceUnset, isValidMinDistanceForGrid, parseCrsTransform, requiredMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {isSupportedSamplingGridCrs, isValidStratificationCrs, supportedSamplingGridCrsNames} from '#sepal/recipe/samplingDesign/samplingGridCrs'

const UNSUPPORTED_ARRANGEMENT_CRS = 'The selected Sample Arrangement CRS is not supported. Choose one of: {supported}.'
const INVALID_STRATIFICATION_CRS = 'The Stratification CRS is missing. Provide the projected CRS the categorical source is interpreted in.'
const INVALID_SCALE = 'The Stratification Scale is invalid. Provide a positive Scale in metres.'
const INVALID_TRANSFORM = 'The Stratification CRS transform is invalid. Provide six numbers of the form [a, 0, xOrigin, 0, -a, yOrigin]: north-up, square pixels, no rotation or shear.'
const INVALID_MIN_DISTANCE = 'The minimum distance is not a number. Provide a distance in metres, or leave it unset to use the smallest distance the sampling grid allows.'
const MIN_DISTANCE_BELOW_GRID = 'Minimum distance is {value} m, but the current stratification grid uses {pixelSize} m pixels and requires at least {minimum} m. Enter {minimum} m or more, or leave the field empty to use {minimum} m automatically.'

const structured = ({key, message, args = {}}) => {
    // Replace EVERY occurrence: a message may reference the same argument more than once.
    const resolved = message.replace(/{(\w+)}/g, (match, name) => name in args ? String(args[name]) : match)
    return new ClientException(resolved, {userMessage: {key, message, args}})
}

// Task-boundary validation of the two sampling grids. Synchronous (no EE): the copy/pastable candidate function
// stays projection-agnostic, so the grid contract is enforced HERE, before the EE graph is built - recipes can
// arrive through non-GUI paths, so a GUI restriction alone is insufficient.
//
// The two grids have DIFFERENT contracts. Sample placement needs a curated equal-area CRS, so the Arrangement
// CRS is checked against the catalog. Stratification names the projection the categorical source is interpreted
// in, so any non-blank CRS is legal there.
export const unsupportedArrangementCrsError = crs =>
    isSupportedSamplingGridCrs(crs)
        ? null
        : structured({
            key: 'tasks.samplingDesign.grid.unsupportedArrangementCrs',
            message: UNSUPPORTED_ARRANGEMENT_CRS,
            // Concise option names only - never the full WKT.
            args: {supported: supportedSamplingGridCrsNames().join(', ')}
        })

export const stratifiedGridError = ({stratificationGrid, arrangementGrid} = {}) => {
    const arrangementError = unsupportedArrangementCrsError(arrangementGrid?.crs)
    if (arrangementError) {
        return arrangementError
    }
    if (!isValidStratificationCrs(stratificationGrid?.crs)) {
        return structured({
            key: 'tasks.samplingDesign.grid.invalidStratificationCrs',
            message: INVALID_STRATIFICATION_CRS
        })
    }
    // A transform defines alignment AND resolution, so it replaces Scale rather than supplementing it. The grid
    // arrives with exactly one definition, so the presence of the key is the mode.
    if ('crsTransform' in (stratificationGrid || {})) {
        const transform = parseCrsTransform(stratificationGrid.crsTransform)
        return transform && isAxisAlignedTransform(transform)
            ? null
            : structured({
                key: 'tasks.samplingDesign.grid.invalidStratificationTransform',
                message: INVALID_TRANSFORM
            })
    }
    const scale = stratificationGrid?.scale
    const scaleNumber = Number(scale)
    return scale != null && scale !== '' && Number.isFinite(scaleNumber) && scaleNumber > 0
        ? null
        : structured({key: 'tasks.samplingDesign.grid.invalidScale', message: INVALID_SCALE})
}

// Unstratified systematic sampling is analytical: spacing comes from minDistance, not a raster grid, and the
// design has no Stratification grid at all. It requires only a curated Arrangement CRS.
export const unstratifiedSystematicGridError = ({arrangementGrid} = {}) =>
    unsupportedArrangementCrsError(arrangementGrid?.crs)

// Stratified systematic sampling places its lattice on the stratification grid, so samples can never be closer
// than two grid pixels. Kept SEPARATE from the grid-definition errors above: random sampling validates its grids
// with those but has no minimum distance, and unstratified systematic is analytical, so neither may be checked
// against the raster floor. Run this only for stratified systematic recipes, after the grids are valid.
export const stratifiedMinDistanceError = ({minDistance, stratificationGrid} = {}) => {
    const grid = {scale: stratificationGrid?.scale, crsTransform: stratificationGrid?.crsTransform}
    // A non-numeric value has no magnitude to compare, so report it as malformed rather than rendering "NaN m".
    // Recipes can arrive through non-GUI paths, so this cannot rely on the panel's own field validation.
    if (!isMinDistanceUnset(minDistance) && !Number.isFinite(Number(minDistance))) {
        return structured({
            key: 'tasks.samplingDesign.systematic.grid.invalidMinDistance',
            message: INVALID_MIN_DISTANCE
        })
    }
    if (isValidMinDistanceForGrid({minDistance, ...grid})) {
        return null
    }
    return structured({
        key: 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid',
        message: MIN_DISTANCE_BELOW_GRID,
        args: {
            value: formatDistance(minDistance),
            pixelSize: formatDistance(gridPixelSize(grid)),
            minimum: formatDistance(requiredMinDistance(grid))
        }
    })
}
