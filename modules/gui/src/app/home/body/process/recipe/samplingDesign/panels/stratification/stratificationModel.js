import {msg} from '~/translate'

// Unstratified mode persists the single computed stratum carrying the AOI area. Accept only a single row with
// a finite, positive area: more than one row means stale stratified data leaked across modes and must not be
// treated as an unstratified result. If the area hasn't been computed (or failed), persist no strata so
// validation blocks export rather than emitting a row with a missing/invalid area.
export const unstratifiedStrata = strata => {
    const computed = strata?.length === 1 ? strata[0] : null
    if (!computed || !Number.isFinite(computed.area) || computed.area <= 0) {
        return []
    }
    return [{
        color: computed.color || '#000000',
        label: computed.label || msg('process.samplingDesign.panel.stratification.unstratified'),
        value: 1,
        stratum: 1,
        area: computed.area,
        weight: 1
    }]
}

export const valuesToModel = values => {
    const isSkipped = !!values.skip?.length
    return {
        skip: isSkipped,
        scale: parseFloat(values.scale),
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
    type: model.type,
    assetId: model.assetId,
    recipeId: model.recipeId,
    band: model.band,
    strata: model.strata,
    // Effective default for recipes saved before eeStrategy existed, so eeStrategy.set('ONLINE') on mount is a
    // no-op rather than a dirtying ''->'ONLINE' change.
    eeStrategy: model.eeStrategy || 'ONLINE'
})
