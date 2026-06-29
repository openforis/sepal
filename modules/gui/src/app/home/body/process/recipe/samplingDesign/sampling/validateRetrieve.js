import {toTaskAllocation} from './taskAllocation'

// Pure retrieve preflight over the CURRENT persisted (joined-array) Sampling Design model - NOT the
// clean selector shape. Returns an ordered, de-duplicated array of {section, code}; an empty array means
// the design is ready to submit. The final row checks reuse toTaskAllocation(model) so they validate
// exactly what the task will receive. No GUI/React deps: the caller maps codes to messages.

// Sampling divides by the per-stratum sample size (systematic hex spacing, random min-distance), so
// every submitted row needs a strictly positive integer count - zero is not a valid "skip this stratum".
const isPositiveInteger = value =>
    value != null && value !== '' && /^\d+$/.test(String(value)) && Number(value) > 0

const hasFiniteArea = value =>
    value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0

export const validateRetrieve = model => {
    const errors = []
    const add = (section, code) => errors.push({section, code})

    const strata = model?.stratification?.strata
    if (!strata?.length) {
        add('stratification', 'noStrata')
    } else if (strata.some(stratum => !hasFiniteArea(stratum.area))) {
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

    const allocation = model?.sampleAllocation?.allocation
    if (!allocation?.length) {
        add('sampleAllocation', 'noAllocation')
    } else if (allocation.some(row => !isPositiveInteger(row.sampleSize))) {
        // Raw rows: normalization turns a blank or zero sample size into 0, which the backend can't
        // divide by - so reject it here before it's flattened.
        add('sampleAllocation', 'sampleSizeInvalid')
    }

    const taskRows = toTaskAllocation(model)
    if (!taskRows?.length) {
        add('sampleAllocation', 'noTaskAllocation')
    } else {
        if (taskRows.some(row => !hasFiniteArea(row.area))) {
            add('sampleAllocation', 'areaMissing')
        }
        if (taskRows.some(row => !isPositiveInteger(row.sampleSize))) {
            add('sampleAllocation', 'sampleSizeInvalid')
        }
    }

    const seen = new Set()
    return errors.filter(({section, code}) => {
        const key = `${section}:${code}`
        return seen.has(key) ? false : (seen.add(key), true)
    })
}
