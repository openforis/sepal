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
        // The RESOLVED grid, not the user fields: those are blank when the derived grid is in use, and the task
        // boundary has no access to it.
        scale: parseFloat(values.resolvedScale),
        crs: values.resolvedCrs,
        // Omitted rather than nulled when no transform applies, so a scale-mode recipe keeps its existing shape.
        ...(values.crsTransform ? {crsTransform: values.crsTransform} : {}),
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
    // User fields stay blank; a saved recipe's grid is carried by the resolved fields.
    scale: null,
    crs: null,
    resolvedScale: model.scale,
    resolvedCrs: model.crs,
    crsTransform: model.crsTransform,
    type: model.type,
    assetId: model.assetId,
    recipeId: model.recipeId,
    band: model.band,
    strata: model.strata,
    // Effective default for recipes saved before eeStrategy existed, so eeStrategy.set('ONLINE') on mount is a
    // no-op rather than a dirtying ''->'ONLINE' change.
    eeStrategy: model.eeStrategy || 'ONLINE'
})
