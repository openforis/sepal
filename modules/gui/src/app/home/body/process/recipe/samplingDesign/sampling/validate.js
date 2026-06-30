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

    const allocationView = selectAllocationView(model)
    if (!allocationView) {
        add('sampleAllocation', 'allocationNotComputed')
    } else if (allocationView.some(({sampleSize}) => !Number.isInteger(sampleSize) || sampleSize < 0)) {
        // Catches the infeasible cases (NaN/Infinity from an unreachable relative margin of error) as
        // well as negative/fractional sizes.
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

    return {valid: errors.length === 0, errors}
}
