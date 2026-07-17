import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {msg} from '~/translate'

// The single synthetic stratum for unstratified mode. Area is intentionally omitted here: the export
// boundary computes it from the AOI geometry, so the panel is valid immediately without a hidden EE area
// request.
export const syntheticUnstratifiedStratum = label => ({
    color: '#000000',
    label,
    value: 1,
    stratum: 1,
    weight: 1
})

// Normalize the persisted unstratified strata. Accept only a single row: more than one row means stale
// stratified data leaked across modes and must not be treated as an unstratified result. Area is optional
// at this stage (the export boundary fills it from the AOI geometry); carry it through only when already a
// finite, positive value.
export const unstratifiedStrata = strata => {
    const computed = strata?.length === 1 ? strata[0] : null
    if (!computed) {
        return []
    }
    const row = syntheticUnstratifiedStratum(computed.label || msg('process.samplingDesign.panel.stratification.unstratified'))
    row.color = computed.color || '#000000'
    return [Number.isFinite(computed.area) && computed.area > 0 ? {...row, area: computed.area} : row]
}

export const valuesToModel = values => {
    const isSkipped = !!values.skip?.length
    return {
        skip: isSkipped,
        // scale and crsTransform are mutually exclusive - when a transform defines the grid, scale is NOT
        // stored (it is derived from the transform downstream). The stratification grid CRS + optional expert
        // crsTransform is the one grid areaPerStratum + the exact-first class grid + the stratified lattice all
        // read, so area/weights and membership stay consistent. crsTransform is '' unless an expert alignment
        // is set.
        scale: values.crsTransform ? undefined : parseFloat(values.scale),
        crs: values.crs || DEFAULT_SAMPLING_GRID_CRS,
        crsTransform: values.crsTransform || '',
        type: values.type,
        assetId: values.assetId,
        recipeId: values.recipeId,
        band: values.band,
        strata: isSkipped
            ? unstratifiedStrata(values.strata)
            : values.strata,
        eeStrategy: values.eeStrategy
    }
}

export const modelToValues = model => ({
    // Carry requiresUpdate into the form values (default false) so the mount-time requiresUpdate.set(false) is
    // a no-op for an up-to-date recipe. Without it the field initializes to '' and set(false) flips ''->false,
    // dirtying the panel on open. A stale model (requiresUpdate: true) initializes true and recalculates on
    // mount, which legitimately dirties the form.
    requiresUpdate: !!model.requiresUpdate,
    skip: model.skip ? [true] : [],
    scale: model.scale,
    // Default the curated grid for recipes saved before the stratification CRS existed, so the panel's mount
    // default is a no-op rather than a dirtying ''->id change. crsTransform defaults to '' likewise.
    crs: model.crs || DEFAULT_SAMPLING_GRID_CRS,
    crsTransform: model.crsTransform || '',
    type: model.type,
    assetId: model.assetId,
    recipeId: model.recipeId,
    band: model.band,
    strata: model.strata,
    // Effective default for recipes saved before eeStrategy existed, so eeStrategy.set('ONLINE') on mount is a
    // no-op rather than a dirtying ''->'ONLINE' change.
    eeStrategy: model.eeStrategy || 'ONLINE'
})
