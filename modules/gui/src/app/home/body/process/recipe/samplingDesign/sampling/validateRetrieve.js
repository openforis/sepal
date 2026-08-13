import {allocationStrataMismatch, belowConfiguredMinimum} from '#sepal/recipe/samplingDesign/allocationValidation'
import {effectiveMinSamplesPerStratum, isValidMinSamplesPerStratum, isValidStratumSampleSize, usesConfiguredMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {formatDistance, gridPixelSize, isValidMinDistanceForGrid, requiredMinDistance} from '#sepal/recipe/samplingDesign/samplingGrid'
import {isStratificationSkipped} from '#sepal/recipe/samplingDesign/stratificationSkip'

import {toTaskAllocation} from './taskAllocation'

// Pure retrieve preflight over the persisted Sampling Design model. Returns an ordered array of
// {section, code, args?}; an empty array means the design is ready to submit. `args` is present only when the
// error has exact values to report. No GUI/React deps: the caller maps codes to messages.

// Sampling divides by the per-stratum sample size (systematic hex spacing, random draw counts), so every
// submitted row needs an integer count - and the statistical floor means it can never be below
// MIN_SAMPLES_PER_STRATUM. Shares the contract the task preflight re-checks, so the GUI cannot approve a
// design the backend rejects.
const isPositiveInteger = value =>
    value != null && value !== '' && /^\d+$/.test(String(value)) && isValidStratumSampleSize(value)

const hasFiniteArea = value =>
    value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0

// Matches the panel's seed field: a non-negative integer.
const isNonNegativeInteger = value =>
    value != null && value !== '' && /^\d+$/.test(String(value))

// Sections whose persisted `requiresUpdate` flag means their computed output is stale relative to upstream
// edits. Checked first so a stale section reports a clear "update this first" instead of a downstream
// stale-data symptom.
const REQUIRES_UPDATE_SECTIONS = ['stratification', 'proportions', 'sampleAllocation', 'sampleArrangement']

export const validateRetrieve = model => {
    const errors = []
    // `args` is optional: an error carries message arguments only when it has exact values to report.
    const add = (section, code, args) => errors.push(args ? {section, code, args} : {section, code})

    REQUIRES_UPDATE_SECTIONS.forEach(section => {
        if (model?.[section]?.requiresUpdate === true) {
            add(section, 'requiresUpdate')
        }
    })

    // Unstratified designs (stratification.skip) carry a single synthetic stratum with no area yet - the
    // export boundary computes it from the AOI geometry - so area checks are skipped for them. Stratified
    // designs still require a finite, positive per-stratum area.
    const isUnstratified = isStratificationSkipped(model?.stratification)

    const strata = model?.stratification?.strata
    if (!strata?.length) {
        add('stratification', 'noStrata')
    } else if (!isUnstratified && strata.some(stratum => !hasFiniteArea(stratum.area))) {
        add('stratification', 'strataAreaMissing')
    }

    // Authoritative on the proportions skip flag; OPTIMAL/POWER and sample-size estimation all need
    // per-stratum proportions and are invalid without them.
    const hasProportions = !model?.proportions?.skip && !!model?.proportions?.anticipatedProportions?.length
    const strategy = model?.sampleAllocation?.allocationStrategy
    const estimateSampleSize = !!model?.sampleAllocation?.estimateSampleSize
    if (!hasProportions && (strategy === 'OPTIMAL' || strategy === 'POWER' || estimateSampleSize)) {
        add('sampleAllocation', 'proportionsRequired')
    }

    // Automatic allocation must state the minimum it was built with; EQUAL and manual carry the implicit
    // statistical floor instead, so they don't expose the field.
    if (usesConfiguredMinSamplesPerStratum(model?.sampleAllocation || {})
        && !isValidMinSamplesPerStratum(model?.sampleAllocation?.minSamplesPerStratum)) {
        add('sampleAllocation', 'minSamplesPerStratumInvalid')
    }

    const allocation = model?.sampleAllocation?.allocation
    if (!allocation?.length) {
        add('sampleAllocation', 'noAllocation')
    } else if (allocation.some(row => !isPositiveInteger(row.sampleSize))) {
        // Any row below MIN_SAMPLES_PER_STRATUM (or blank/non-integer) cannot be sampled.
        add('sampleAllocation', 'sampleSizeInvalid')
    }

    // Area is joined from stratification onto the materialized task rows, so check it there (stratified only).
    const taskRows = toTaskAllocation(model)
    if (!isUnstratified && taskRows?.some(row => !hasFiniteArea(row.area))) {
        add('sampleAllocation', 'areaMissing')
    }

    // Automatic allocation must also satisfy its own configured minimum (the task preflight re-checks this): a
    // row that clears the statistical floor but falls below Min samples/stratum must not pass Retrieve. Error
    // mode edits Target margin of error, Samples mode edits Total sample size, so the guidance differs.
    if (allocation?.length && belowConfiguredMinimum(allocation, effectiveMinSamplesPerStratum(model?.sampleAllocation || {})).length) {
        const mode = model?.sampleAllocation?.estimateSampleSize ? 'error' : 'samples'
        add('sampleAllocation', `belowConfiguredMinimum.${mode}`)
    }

    // The allocation must cover the configured strata exactly - no missing, duplicate or unexpected strata.
    if (allocationStrataMismatch(model)) {
        add('sampleAllocation', 'strataMismatch')
    }

    // Seed drives random draws, EXACT thinning, and the SEEDED systematic grid offset - require it there.
    const arrangement = model?.sampleArrangement || {}
    const seedRequired = arrangement.arrangementStrategy === 'RANDOM'
        || arrangement.sampleSizeStrategy === 'EXACT'
        || (arrangement.arrangementStrategy === 'SYSTEMATIC' && arrangement.gridOrigin === 'SEEDED')
    if (seedRequired && !isNonNegativeInteger(arrangement.seed)) {
        add('sampleArrangement', 'seedMissing')
    }

    // A stratified systematic lattice sits on the stratification grid, so samples can never be closer than two
    // grid pixels. Unstratified systematic is analytical and random has no minimum distance, so neither applies.
    const stratificationGrid = model?.stratification || {}
    const grid = {scale: stratificationGrid.scale}
    if (arrangement.arrangementStrategy === 'SYSTEMATIC' && !isUnstratified
        && !isValidMinDistanceForGrid({minDistance: arrangement.minDistance, ...grid})) {
        // Report the exact numbers: the same shared floor calculation the panel and task boundary use.
        add('sampleArrangement', 'minDistanceBelowGrid', {
            value: formatDistance(arrangement.minDistance),
            pixelSize: formatDistance(gridPixelSize(grid)),
            minimum: formatDistance(requiredMinDistance(grid))
        })
    }

    return errors
}
