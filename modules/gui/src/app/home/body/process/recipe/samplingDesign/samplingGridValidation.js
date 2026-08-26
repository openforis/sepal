import {formatDistance} from '#sepal/recipe/samplingDesign/samplingGrid'

import {getDefaultModel} from './sampling/defaultModel'

// The grid defaults the Stratification and Proportions panels apply when a source or band is SELECTED. What
// they produce is ordinary configuration from then on: it is shown, persisted, and only replaced by another
// selection - never re-derived behind the user.

// Scale must be numeric and positive.
export const isValidGridScale = value =>
    Number.isFinite(Number(value)) && Number(value) > 0

const blank = value => value == null || String(value).trim() === ''

const usableScale = value => {
    const scale = Number(value)
    return Number.isFinite(scale) && scale > 0 ? formatDistance(scale) : null
}

// One authority for what a design falls back to: what a new recipe starts as.
const fallbackGrid = () => {
    const {crs, scale} = getDefaultModel().stratification
    return {crs, scale}
}

const bandOf = (bands, bandName) => (bands || []).find(({id}) => id === bandName)

// What a selected Stratification band provides: that band's own CRS, and its nominal scale IN METRES. It fills
// the transient source fields the visible overrides fall back to, never the visible fields themselves.
// Per-band grids are real - a Sentinel-2 asset carries 60 m and 10 m bands side by side - so the SELECTED band
// is read rather than the first. Each field falls back on its own, because a source can report one without the
// other. A recipe has no band metadata at all, so it takes the fallback whole.
export const stratificationGridFromBand = (bands, bandName) => {
    const band = bandOf(bands, bandName)
    const fallback = fallbackGrid()
    return {
        crs: band?.crs || fallback.crs,
        scale: usableScale(band?.nominalScale) || fallback.scale
    }
}

// What a selected Proportions property band provides: the COARSEST grid the answer can carry.
//
// A cost/precision policy for a rough estimate, not an arithmetic necessity. Reading the probability finer than
// the strata it is grouped by buys detail the grouping immediately discards, while reading it coarser than its
// own source invents detail the source does not have. An unstratified estimate has no strata to group by, so
// only the property's own band constrains it.
export const proportionsScaleFromBand = (bands, bandName, {unstratified, stratificationScale} = {}) => {
    const propertyScale = usableScale(bandOf(bands, bandName)?.nominalScale)
    const candidates = (unstratified ? [propertyScale] : [usableScale(stratificationScale), propertyScale])
        .filter(scale => scale !== null)
    return candidates.length ? Math.max(...candidates) : fallbackGrid().scale
}

// What a panel actually calculates with, and what Apply persists.
//
// A visible field is an OVERRIDE: what the user typed wins, and clearing it means "use what this selection
// provides" - the source's own value, or failing that the recipe default. Blank is a form-level operation, so
// the recipe only ever stores the resolved value and never the fact that a field was left empty.
//
// A nonblank value that is not a usable Scale resolves to null rather than falling back: clearing the field
// asks for the default, but typing 0 asks for something the design cannot run on, and quietly substituting the
// source value would run a calculation nobody asked for.
const overriddenScale = (scale, ...fallbacks) =>
    blank(scale)
        ? fallbacks.map(usableScale).find(value => value !== null) ?? fallbackGrid().scale
        : usableScale(scale)

export const effectiveStratificationGrid = ({crs, scale, sourceCrs, sourceScale} = {}) => ({
    crs: (blank(crs) ? sourceCrs : String(crs).trim()) || fallbackGrid().crs,
    scale: overriddenScale(scale, sourceScale)
})

// `defaultScale` is what the current property-band selection defaults to - the max policy applied by
// proportionsScaleFromBand when that selection was made.
export const effectiveProportionsScale = ({scale, defaultScale} = {}) => overriddenScale(scale, defaultScale)
