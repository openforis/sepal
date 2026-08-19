import {formatDistance, isAxisAlignedTransform, parseCrsTransform} from '#sepal/recipe/samplingDesign/samplingGrid'

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

// Whether the derived transform is in effect. ONE predicate rather than a transition table: clearing Scale,
// retyping the native value, editing the CRS and editing it back all fall out of the same expression, so there
// is no ordering to get wrong.
//
// The transform survives an entered Scale that AGREES with the derived metre size. Otherwise typing the number
// the placeholder just showed would silently degrade the image's own grid to a resampled one. Both sides are
// rounded through formatDistance, so an equivalent value like 9.99999999 reads as agreement.
//
// This is exact equality between two identically-rounded values with the outcome shown on screen - not a
// tolerance band, which is what made the three rejected magnitude thresholds unusable.
export const isStratificationTransformActive = ({derived, crs, scale}) => {
    if (!derived || crs !== derived.crs) {
        return false
    }
    const entered = String(scale ?? '').trim()
    return entered === ''
        || formatDistance(Number(entered)) === formatDistance(derived.pixelSizeMetres)
}

// The panel's whole grid decision, derived from ONE evaluation of the predicate rather than from per-handler
// transitions. Clearing Scale, retyping the native value and CRS round-trips all fall out of re-evaluating this,
// so there is no ordering to get wrong and no memory of how the inputs got here.
//
// `scaleRequired` is false only while a transform is in effect: that is the sole case where a blank Scale still
// defines a grid. A recipe, a collection, a non-axis-aligned asset or a CRS edited away from the derived one all
// leave nothing behind, so Scale is required again.
export const stratificationGridState = ({derived, crs, scale}) => {
    const active = isStratificationTransformActive({derived, crs, scale})
    return {
        crsTransform: active ? derived.crsTransform : null,
        scaleRequired: !active,
        // Three states: no derived grid has no mode to be in, so it shows nothing.
        mode: !derived ? 'none' : active ? 'imageGrid' : 'resampled',
        placeholder: derived ? derived.pixelSizeMetres : null
    }
}

// Scale's initial value. A RECIPE has no source grid to read, so it needs a concrete default. An ASSET starts
// BLANK: if a grid is derived, blank is correct and the placeholder shows the pixel size; if none is derived,
// ordinary required-field validation asks for a value. Auto-filling 30 for an asset would invent a resolution
// for an image whose real one we simply could not read, and would do it invisibly - the model would look valid.
export const stratificationScaleDefault = type =>
    type === 'RECIPE' ? '30' : null
