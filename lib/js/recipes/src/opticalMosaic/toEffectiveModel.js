// Projects a stored MOSAIC model (the GUI's persisted form, which may carry
// dormant preferences for sub-configurations the user isn't currently using)
// to the effective shape the LLM sees. See ../README.md for the contract.
//
// Pure (deep-clones the input) and idempotent.

function toEffectiveModel(model) {
    const out = structuredClone(model)
    const composite = out?.compositeOptions
    const groups = Object.keys(out?.sources?.dataSets || {})
    const hasLandsat = groups.includes('LANDSAT')
    const hasSentinel2 = groups.includes('SENTINEL_2')
    const hasMultipleSourceGroups = hasLandsat && hasSentinel2

    if (composite) {
        canonicalizeCloudBuffer(composite)
        canonicalizeCorrections(composite, {hasMultipleSourceGroups})
        const corrections = composite.corrections || []
        const hasSR = corrections.includes('SR')
        if (Array.isArray(composite.includedCloudMasking)) {
            composite.includedCloudMasking = composite.includedCloudMasking.filter(method =>
                isMethodApplicable(method, {hasLandsat, hasSentinel2, hasSR})
            )
        }
        stripUnusedMethodTuning(composite)
        if (!corrections.includes('BRDF')) {
            delete composite.brdfMultiplier
        }
    }

    if (hasMultipleSourceGroups && out?.sceneSelectionOptions) {
        out.sceneSelectionOptions.type = 'ALL'
    }
    if (out?.sceneSelectionOptions?.type !== 'SELECT') {
        delete out.scenes
    }

    return out
}

function canonicalizeCloudBuffer(composite) {
    if (composite.cloudBuffer === undefined && composite.cloudBuffering !== undefined) {
        composite.cloudBuffer = composite.cloudBuffering
    }
    delete composite.cloudBuffering
}

function canonicalizeCorrections(composite, {hasMultipleSourceGroups}) {
    if (!Array.isArray(composite.corrections)) return
    if (composite.corrections.includes('SR')) {
        composite.corrections = composite.corrections.filter(correction => correction !== 'CALIBRATE')
        return
    }
    if (hasMultipleSourceGroups) return
    composite.corrections = composite.corrections.filter(correction => correction !== 'CALIBRATE')
}

function isMethodApplicable(method, {hasLandsat, hasSentinel2, hasSR}) {
    switch (method) {
        case 'landsatCFMask': return hasLandsat
        case 'sentinel2CloudScorePlus': return hasSentinel2
        case 'sentinel2CloudProbability': return hasSentinel2
        case 'pino26': return hasSentinel2 && !hasLandsat && !hasSR
        default: return true
    }
}

function stripUnusedMethodTuning(composite) {
    const included = new Set(composite.includedCloudMasking || [])
    if (!included.has('sentinel2CloudProbability')) {
        delete composite.sentinel2CloudProbabilityMaxCloudProbability
    }
    if (!included.has('sentinel2CloudScorePlus')) {
        delete composite.sentinel2CloudScorePlusBand
        delete composite.sentinel2CloudScorePlusMaxCloudProbability
    }
    if (!included.has('landsatCFMask')) {
        delete composite.landsatCFMaskCloudMasking
        delete composite.landsatCFMaskCloudShadowMasking
        delete composite.landsatCFMaskCirrusMasking
        delete composite.landsatCFMaskDilatedCloud
    }
    if (!included.has('sepalCloudScore')) {
        delete composite.sepalCloudScoreMaxCloudProbability
    }
}

module.exports = {toEffectiveModel}
