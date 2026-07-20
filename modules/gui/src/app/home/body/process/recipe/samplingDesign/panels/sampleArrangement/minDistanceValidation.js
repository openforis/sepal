import {
    gridPixelSize,
    isMinDistanceUnset,
    requiredMinDistance
} from '#sepal/recipe/samplingDesign/samplingGrid'

// Pure Minimum distance validation, shared by the Sample Arrangement panel and its tests. The rule depends on
// the Stratification grid - state owned by another panel - so the panel applies it as derived validation
// rather than as a field predicate.

// Distances are metres derived from a grid size, so trim floating-point noise (0.30000000000000004 -> 0.3)
// without imposing a fixed number of decimals.
export const formatDistance = value => Number(Number(value).toFixed(4))

// The grid pixel size behind the floor, for the blank-value tooltip.
export const minDistancePixelSize = ({stratificationGrid} = {}) => gridPixelSize(stratificationGrid)

// The raster spacing floor for the current design, or null when the rule does not apply: unstratified
// systematic sampling is analytical, and random sampling has no minimum distance.
export const minDistanceGridFloor = ({unstratified, arrangementStrategy, stratificationGrid} = {}) =>
    unstratified || arrangementStrategy !== 'SYSTEMATIC'
        ? null
        : requiredMinDistance(stratificationGrid)

// Numeric message arguments when an entered distance is below the floor, otherwise null.
//
// Blank is valid (it resolves to the floor at export), and a non-numeric entry is deliberately NOT reported
// here: the field's own .number() validator owns that, and formatting a NaN would render "NaN m".
export const minDistanceFloorViolation = ({minDistance, ...applicability} = {}) => {
    const minimum = minDistanceGridFloor(applicability)
    if (minimum === null || isMinDistanceUnset(minDistance)) {
        return null
    }
    const value = Number(minDistance)
    if (!Number.isFinite(value) || value >= minimum) {
        return null
    }
    return {
        value: formatDistance(value),
        pixelSize: formatDistance(gridPixelSize(applicability.stratificationGrid)),
        minimum: formatDistance(minimum)
    }
}
