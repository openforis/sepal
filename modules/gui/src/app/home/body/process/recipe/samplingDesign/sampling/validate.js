import {isValidMinSamplesPerStratum, isValidStratumSampleSize, usesConfiguredMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {isValidMinDistanceForGrid} from '#sepal/recipe/samplingDesign/samplingGrid'
import {isStratificationSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

import {selectAllocationView, selectProportionView, selectStrataView} from './selectors'

// Central, pure validation of a Sampling Design model in the clean shape. Returns
// {valid, errors:[{section, code}]}, where `code` is a stable identifier the UI can map to a message.
// Validates the cross-section invariants that no single panel owns; per-field input validation stays
// with each panel's Form constraints. Reads the derived views, so it reports "not computed" until the
// async EE data (areas/probabilities) is available.
export const validateSamplingDesign = model => {
    const errors = []
    const add = (section, code) => errors.push({section, code})

    const strata = selectStrataView(model)
    if (!strata) {
        add('stratification', 'strataNotComputed')
        return {valid: false, errors}
    }
    if (!strata.length) {
        add('stratification', 'noStrata')
        return {valid: false, errors}
    }

    if (!model?.proportions?.skip) {
        const proportionView = selectProportionView(model)
        if (!proportionView) {
            add('proportions', 'proportionsNotComputed')
        } else if (proportionView.some(({proportion}) => !Number.isFinite(proportion) || proportion < 0 || proportion > 1)) {
            add('proportions', 'proportionOutOfRange')
        }
    }

    // Automatic allocation must explicitly carry a valid minimum. The derived view applies the effective
    // floor, so an invalid configured minimum would otherwise be silently corrected here and reported valid
    // while validateRetrieve and the task preflight reject it. EQUAL and manual carry the implicit floor and
    // expose no field, so they're exempt.
    const allocationModel = model?.sampleAllocation || {}
    if (usesConfiguredMinSamplesPerStratum(allocationModel)
        && !isValidMinSamplesPerStratum(allocationModel.minSamplesPerStratum)) {
        add('sampleAllocation', 'minSamplesPerStratumInvalid')
    }

    const allocationView = selectAllocationView(model)
    if (!allocationView) {
        add('sampleAllocation', 'allocationNotComputed')
    } else if (allocationView.some(({sampleSize}) => !isValidStratumSampleSize(sampleSize))) {
        // Catches the infeasible cases (NaN/Infinity from an unreachable relative margin of error) as well
        // as negative/fractional sizes and any row below the statistical floor.
        add('sampleAllocation', 'allocationInvalid')
    }

    const arrangement = model?.sampleArrangement || {}
    // Seed drives random draws, EXACT thinning, and the SEEDED systematic grid offset.
    const seedRelevant = arrangement.arrangementStrategy === 'RANDOM'
        || arrangement.sampleSizeStrategy === 'EXACT'
        || (arrangement.arrangementStrategy === 'SYSTEMATIC' && arrangement.gridOrigin === 'SEEDED')
    if (seedRelevant && !Number.isFinite(arrangement.seed)) {
        add('sampleArrangement', 'seedMissing')
    }

    // A stratified systematic lattice sits on the stratification grid, so samples can never be closer than two
    // grid pixels. Unstratified systematic is analytical and random has no minimum distance, so neither applies.
    const stratification = model?.stratification || {}
    if (arrangement.arrangementStrategy === 'SYSTEMATIC' && !isStratificationSkipped(stratification)
        && !isValidMinDistanceForGrid({minDistance: arrangement.minDistance, scale: stratification.scale})) {
        add('sampleArrangement', 'minDistanceBelowGrid')
    }

    return {valid: errors.length === 0, errors}
}
