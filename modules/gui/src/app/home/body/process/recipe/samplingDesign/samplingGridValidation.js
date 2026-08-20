import {formatDistance, isAxisAlignedTransform, parseCrsTransform} from '#sepal/recipe/samplingDesign/samplingGrid'
import {DEFAULT_STRATIFICATION_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// GUI-side sampling-grid validators for the Stratification panel.

// Scale must be numeric and positive.
export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0

// Derive the stratification grid from the SELECTED band's own grid. Every source type reports the same shape -
// `crs` plus a six-element `crs_transform` - whether it came from a plain Image asset's description or from an
// ImageCollection's first image, so this is one path rather than a branch on asset type.
//
// Per-band grids are real: a Sentinel-2 asset carries 60 m and 10 m bands side by side, so reading bands[0]
// would derive the wrong resolution for most selections.
//
// isAxisAlignedTransform is the WHOLE guard. It rejects the identity transform [1,0,0,0,1,0] that a computed
// image reports, by sign alone, so such a source falls through to the default with no magnitude threshold
// anywhere. It cannot see units: a degree transform is legitimately axis-aligned, which is why the caller also
// captures the pixel size in metres separately.
export const deriveStratificationGrid = (metadata, bandName) => {
    const band = (metadata?.bands || []).find(({id}) => id === bandName)
    const crsTransform = parseCrsTransform(band?.crs_transform)
    return band?.crs && crsTransform && isAxisAlignedTransform(crsTransform)
        ? {crs: band.crs, crsTransform}
        : null
}

export const DEFAULT_STRATIFICATION_SCALE = 30

const blank = value => value == null || String(value).trim() === ''

// Blank means "use the effective value" - the product's existing idiom, as Min distance already works. Nothing is
// required, and nothing derived is ever written into a user-facing field, so there is no value for a later read
// to race against.
//
// An entered CRS with a blank Scale resolves to the DERIVED pixel size, not the default: asking for a different
// projection is not asking for a different resolution, and a metre value is meaningful in any CRS.
export const resolveStratificationGridState = ({derived, crs, scale}) => {
    const effectiveCrs = !blank(crs)
        ? String(crs).trim()
        : derived?.crs || DEFAULT_STRATIFICATION_CRS
    const effectiveScale = !blank(scale)
        ? Number(scale)
        : derived?.pixelSizeMetres || DEFAULT_STRATIFICATION_SCALE
    // Typing the value the placeholder displays must not demote the design off the image's own grid.
    const scaleAgrees = blank(scale)
        || formatDistance(Number(scale)) === formatDistance(derived?.pixelSizeMetres)
    const applies = !!derived && effectiveCrs === derived.crs && scaleAgrees
    return {
        crs: effectiveCrs,
        scale: effectiveScale,
        crsTransform: applies ? derived.crsTransform : null,
        mode: !derived ? 'none' : applies ? 'imageGrid' : 'resampled',
        placeholderCrs: derived?.crs || DEFAULT_STRATIFICATION_CRS,
        placeholderScale: derived?.pixelSizeMetres || DEFAULT_STRATIFICATION_SCALE
    }
}
