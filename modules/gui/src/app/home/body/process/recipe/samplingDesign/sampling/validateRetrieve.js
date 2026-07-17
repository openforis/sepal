import {isValidMinSamplesPerStratum, isValidStratumSampleSize, usesConfiguredMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'

import {toTaskAllocation} from './taskAllocation'

// Pure retrieve preflight over the CURRENT persisted (joined-array) Sampling Design model - NOT the
// clean selector shape. Returns an ordered, de-duplicated array of {section, code}; an empty array means
// the design is ready to submit. The final row checks reuse toTaskAllocation(model) so they validate
// exactly what the task will receive. No GUI/React deps: the caller maps codes to messages.

// Sampling divides by the per-stratum sample size (systematic hex spacing, random min-distance), so every
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
    const add = (section, code) => errors.push({section, code})

    REQUIRES_UPDATE_SECTIONS.forEach(section => {
        if (model?.[section]?.requiresUpdate === true) {
            add(section, 'requiresUpdate')
        }
    })

    // Unstratified designs (stratification.skip) carry a single synthetic stratum with no area yet - the
    // export boundary computes it from the AOI geometry - so area checks are skipped for them. Stratified
    // designs still require a finite, positive per-stratum area.
    const isUnstratified = model?.stratification?.skip === true

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
        // Raw rows: normalization turns a blank or zero sample size into 0, and any row below
        // MIN_SAMPLES_PER_STRATUM cannot be sampled - reject both before the rows are flattened.
        add('sampleAllocation', 'sampleSizeInvalid')
    }

    const taskRows = toTaskAllocation(model)
    if (!taskRows?.length) {
        add('sampleAllocation', 'noTaskAllocation')
    } else {
        if (!isUnstratified && taskRows.some(row => !hasFiniteArea(row.area))) {
            add('sampleAllocation', 'areaMissing')
        }
        if (taskRows.some(row => !isPositiveInteger(row.sampleSize))) {
            add('sampleAllocation', 'sampleSizeInvalid')
        }
    }

    // Seed drives random draws, EXACT thinning, and the SEEDED systematic grid offset - require it there.
    const arrangement = model?.sampleArrangement || {}
    const seedRequired = arrangement.arrangementStrategy === 'RANDOM'
        || arrangement.sampleSizeStrategy === 'EXACT'
        || (arrangement.arrangementStrategy === 'SYSTEMATIC' && arrangement.gridOrigin === 'SEEDED')
    if (seedRequired && !isNonNegativeInteger(arrangement.seed)) {
        add('sampleArrangement', 'seedMissing')
    }

    const seen = new Set()
    return errors.filter(({section, code}) => {
        const key = `${section}:${code}`
        return seen.has(key) ? false : (seen.add(key), true)
    })
}
