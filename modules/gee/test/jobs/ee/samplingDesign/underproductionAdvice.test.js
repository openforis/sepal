import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {classifyFinalCounts, groupFinalCountFailures} from '#sepal/ee/samplingDesign/finalCountValidation'
import {
    nextDenserMinDistance,
    renderAdvice,
    underproductionAdvice,
    underproductionUserMessage
} from '#sepal/ee/samplingDesign/underproductionAdvice'

const KEY = 'tasks.samplingDesign.underproduction'
const short = key => key.replace(`${KEY}.`, '')

const adviceFor = ({counts, allocation, effectiveMinimum = 2, ...config}) => {
    const failures = classifyFinalCounts({counts, allocation, effectiveMinimum, ...config})
    return underproductionAdvice({groups: groupFinalCountFailures(failures), config: {effectiveMinimum, ...config}})
}
// The decisions each advice group makes: which reason, which diagnosis, which actions, with which arguments.
const decisionsFor = args => adviceFor(args).map(({kind, diagnosis, actions}) => ({
    kind,
    diagnosis: short(diagnosis.key),
    diagnosisArgs: diagnosis.args,
    actions: actions.map(({key}) => short(key)),
    actionArgs: Object.fromEntries(actions.map(({key, args}) => [short(key), args]))
}))
const oneStratum = (actual, sampleSize = 100) => ({
    counts: {1: actual},
    allocation: [{stratum: 1, label: 'snow', sampleSize}]
})
const SYSTEMATIC = {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, pixelSize: 10}
const RANDOM = {arrangementStrategy: 'RANDOM', minDistance: 0, pixelSize: 10}

describe('nextDenserMinDistance', () => {
    it('calculates the next denser threshold for 60 m minimum distance on a 10 m grid', () => {
        assert.ok(
            Math.abs(nextDenserMinDistance({minDistance: 60, pixelSize: 10}) - 55.4) < 10 ** -1 / 2
        )
    })

    it('returns null when the grid already imposes the closest spacing', () => {
        assert.equal(nextDenserMinDistance({minDistance: 20, pixelSize: 10}), null)
        assert.equal(nextDenserMinDistance({minDistance: 60, pixelSize: 30}), null)
    })

    it('uses the min-distance-only contract for analytical unstratified systematic sampling', () => {
        // A 30 m grid would floor a stratified lattice at 60 m, but unstratified spacing is distance-only.
        assert.ok(Math.abs(
            nextDenserMinDistance({minDistance: 60, pixelSize: 30, unstratified: true}) - 55.4
        ) < 10 ** -1 / 2)
        assert.equal(
            nextDenserMinDistance({minDistance: 0, pixelSize: 30, unstratified: true}),
            null
        )
    })
})

describe('statisticalMinimum advice', () => {
    it('offers spacing, Random, and stratum-coverage actions for systematic, with the calculated threshold', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC})
        assert.equal(decision.kind, 'statisticalMinimum')
        assert.equal(decision.diagnosis, 'diagnosis.statisticalMinimum')
        assert.partialDeepStrictEqual(decision.diagnosisArgs, {strata: 'snow (1)', minimum: 2})
        assert.deepEqual(decision.actions, [
            'reduceSystematicMinDistance', 'switchToRandom', 'checkStratumCoverage'
        ])
        assert.deepEqual(
            decision.actionArgs.reduceSystematicMinDistance,
            {minDistance: 60, threshold: 55.4}
        )
    })

    it('replaces the reduce-distance action with the grid floor when spacing cannot help', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC, minDistance: 20})
        assert.ok(decision.actions.includes('atGridFloor'))
        assert.ok(!decision.actions.includes('reduceSystematicMinDistance'))
        assert.deepEqual(decision.actionArgs.atGridFloor, {pixelSize: 10})
    })

    // Minimum distance is Systematic-only, so random advice never mentions spacing - even if a stale value is
    // still on the recipe - and never switches to Random. Stratified random draws at the grid, so it may
    // instead sample at a finer stratification scale.
    it('gives stratified random the finer-scale and coverage actions, no spacing and no switch-to-Random', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...RANDOM, minDistance: 60})
        assert.deepEqual(decision.actions, ['reduceStratificationScale', 'checkStratumCoverage'])
        assert.ok(!decision.actions.includes('switchToRandom'))
    })

    it('blames the grid (not the whole AOI) for random, and offers finer scale plus coverage', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...RANDOM})
        assert.equal(decision.diagnosis, 'diagnosis.statisticalMinimumNoDistance')
        assert.deepEqual(decision.actions, ['reduceStratificationScale', 'checkStratumCoverage'])
        assert.ok(!decision.actions.includes('lowerConfiguredMinimum'))
    })

    it('names every failing stratum with its own count', () => {
        const [decision] = decisionsFor({
            counts: {1: 0, 2: 1},
            allocation: [{stratum: 1, label: 'snow', sampleSize: 100}, {stratum: 2, label: 'water', sampleSize: 100}],
            ...SYSTEMATIC
        })
        assert.equal(decision.diagnosisArgs.strata, 'snow (0); water (1)')
    })
})

describe('configuredMinimum advice', () => {
    it('names the value the minimum could be lowered to, and its floor', () => {
        const [decision] = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC, sampleSizeStrategy: 'CLOSEST'})
        assert.equal(decision.kind, 'configuredMinimum')
        assert.equal(decision.actions[0], 'lowerConfiguredMinimum')
        assert.deepEqual(decision.actionArgs.lowerConfiguredMinimum, {value: 7, floor: 2})
        // CLOSEST is allowed to undershoot, so there is no count shortfall to resolve here.
        assert.ok(!decision.actions.includes('reduceRequestedOrClosest'))
    })

    it('adds the mode-aware count action when the request is also unmet, prioritized over spacing', () => {
        const samples = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC})[0]
        assert.equal(samples.actions[0], 'lowerConfiguredMinimum')
        assert.ok(samples.actions.includes('reduceRequestedOrClosest'))
        assert.ok(samples.actions.length <= 3)
        const error = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC, estimateSampleSize: true})[0]
        assert.ok(error.actions.includes('increaseMarginOfErrorOrClosest'))
        assert.ok(!error.actions.includes('reduceRequestedOrClosest'))
    })

    it('uses finer-scale advice as the capacity action for stratified random', () => {
        const [decision] = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...RANDOM})
        assert.deepEqual(
            decision.actions,
            ['lowerConfiguredMinimum', 'reduceRequested', 'reduceStratificationScale']
        )
    })

    it('never lets the at-grid-floor note displace the count action', () => {
        // minDistance 20 on a 10 m grid is already at the floor, so spacing cannot help; the shortfall action
        // must still be present and atGridFloor must not appear in this group.
        const [decision] = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC, minDistance: 20})
        assert.ok(decision.actions.includes('reduceRequestedOrClosest'))
        assert.ok(!decision.actions.includes('atGridFloor'))
    })
})

describe('requestedAllocation advice', () => {
    it('offers Closest for systematic OVER/EXACT', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC})
        assert.equal(decision.kind, 'requestedAllocation')
        assert.deepEqual(decision.diagnosisArgs, {strata: 'snow (25 of 100)'})
        assert.ok(decision.actions.includes('reduceRequestedOrClosest'))
    })

    it('offers a plain reduce action, never Closest, for random sampling', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...RANDOM})
        assert.ok(decision.actions.includes('reduceRequested'))
        assert.ok(!decision.actions.includes('reduceRequestedOrClosest'))
        assert.doesNotMatch(decision.actions.join(' '), /Closest/)
    })

    it('always recommends something for random with no distance and non-equal allocation', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'PROPORTIONAL', ...RANDOM})
        assert.ok(decision.actions.length > 0)
        assert.deepEqual(decision.actions, ['reduceRequested', 'reduceStratificationScale'])
    })

    // Target mode changes the requested-count advice: Samples mode reduces the fixed count; Error mode raises
    // the target margin of error to calculate a smaller count. Systematic OVER/EXACT may add Closest; random
    // never does.
    it('advises increasing the margin of error in Error mode, adding Closest only for systematic OVER/EXACT', () => {
        const systematic = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, estimateSampleSize: true})[0]
        assert.ok(systematic.actions.includes('increaseMarginOfErrorOrClosest'))
        assert.ok(!systematic.actions.includes('reduceRequestedOrClosest'))
        const random = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...RANDOM, estimateSampleSize: true})[0]
        assert.ok(random.actions.includes('increaseMarginOfError'))
        assert.doesNotMatch(random.actions.join(' '), /Closest/)
    })

    it('advises reducing the sample size in Samples mode', () => {
        const systematic = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, estimateSampleSize: false})[0]
        assert.ok(systematic.actions.includes('reduceRequestedOrClosest'))
        assert.ok(!systematic.actions.includes('increaseMarginOfErrorOrClosest'))
    })

    it('recommends a non-EQUAL strategy only when allocation is EQUAL', () => {
        const equal = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'EQUAL', ...SYSTEMATIC})
        assert.ok(equal[0].actions.includes('avoidEqualAllocation'))
        const proportional = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'PROPORTIONAL', ...SYSTEMATIC})
        assert.ok(!proportional[0].actions.includes('avoidEqualAllocation'))
    })

    it('drops CLOSEST out of requestedAllocation entirely (undershoot is allowed)', () => {
        assert.deepEqual(
            decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, sampleSizeStrategy: 'CLOSEST'}),
            []
        )
    })

    // Manual allocation has no Total sample size and no Target margin of error - the user types a count into
    // each stratum row - so it is sent to the rows it can actually edit.
    describe('manual allocation', () => {
        // A stale estimateSampleSize or EQUAL saved behind Manual must not resurface as advice about controls
        // the user cannot see.
        it('sends random manual shortfalls to the per-stratum counts, ignoring stale saved flags', () => {
            const [decision] = decisionsFor({
                ...oneStratum(25),
                effectiveMinimum: 10,
                ...RANDOM,
                manual: true,
                estimateSampleSize: true,
                allocationStrategy: 'EQUAL'
            })

            assert.ok(decision.actions.includes('reduceRequestedManual'))
            assert.ok(!decision.actions.includes('reduceRequested'))
            assert.ok(!decision.actions.includes('increaseMarginOfError'))
            assert.ok(!decision.actions.includes('increaseMarginOfErrorOrClosest'))
            assert.ok(!decision.actions.includes('avoidEqualAllocation'))
        })

        it('keeps the Closest alternative for systematic OVER and EXACT', () => {
            const over = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, manual: true})[0]
            const exact = decisionsFor({
                ...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, sampleSizeStrategy: 'EXACT', manual: true
            })[0]

            assert.ok(over.actions.includes('reduceRequestedManualOrClosest'))
            assert.ok(exact.actions.includes('reduceRequestedManualOrClosest'))
            assert.ok(!over.actions.includes('reduceRequestedOrClosest'))
        })

        it('leaves a manual stratum below the statistical minimum with no reduction action', () => {
            const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC, manual: true})

            assert.equal(decision.kind, 'statisticalMinimum')
            assert.ok(!decision.actions.includes('reduceRequestedManual'))
            assert.ok(!decision.actions.includes('reduceRequestedManualOrClosest'))
            assert.doesNotMatch(decision.actions.join(' '), /reduceRequested/)
        })
    })
})

describe('underproductionUserMessage', () => {
    it('groups strata by reason and carries structured, per-sentence keys for localization', () => {
        const config = {effectiveMinimum: 10, ...SYSTEMATIC}
        const allocation = [
            {stratum: 1, label: 'snow', sampleSize: 100},
            {stratum: 2, label: 'water', sampleSize: 100},
            {stratum: 3, label: 'crops', sampleSize: 100}
        ]
        const failures = classifyFinalCounts({counts: {1: 1, 2: 7, 3: 25}, allocation, ...config})
        const {key, args} = underproductionUserMessage({groups: groupFinalCountFailures(failures), config})
        assert.equal(key, `${KEY}.message`)
        assert.deepEqual(
            args.advice.map(({kind}) => kind),
            ['statisticalMinimum', 'configuredMinimum', 'requestedAllocation']
        )
        // Every sentence is addressable by key, so a renderer can translate it.
        assert.equal(args.advice.every(({diagnosis, actions}) =>
            diagnosis.key.startsWith(KEY) && actions.every(({key: actionKey}) => actionKey.startsWith(KEY))), true)
    })

    // One focused check that the English fallback interpolates its arguments.
    it('renders an English fallback with arguments interpolated', () => {
        const config = {effectiveMinimum: 2, ...SYSTEMATIC}
        const failures = classifyFinalCounts({...oneStratum(1), ...config})
        const {args} = underproductionUserMessage({groups: groupFinalCountFailures(failures), config})
        assert.ok(args.details.includes('snow (1)'))
        assert.ok(args.details.includes('55.4'))
        assert.ok(!args.details.includes('{'))
        assert.equal(renderAdvice([]), '')
    })
})

// The stratified lattice cannot place samples closer than two grid pixels, so a reduce-distance recommendation
// must never name a value the design could not actually use.
describe('spacing advice never suggests an impossible stratified distance', () => {
    it('keeps every suggested threshold at or above two grid pixels', () => {
        for (const pixelSize of [1, 10, 30, 100]) {
            for (const minDistance of [0, 5, 20, 25, 30, 60, 100, 250, 1000, 5000]) {
                const threshold = nextDenserMinDistance({minDistance, pixelSize})
                if (threshold !== null) {
                    assert.ok(threshold >= 2 * pixelSize)
                }
            }
        }
    })

    it('omits the distance-reduction action at the raster floor but keeps the other actions', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC, minDistance: 20, pixelSize: 10})
        assert.ok(!decision.actions.includes('reduceSystematicMinDistance'))
        assert.ok(decision.actions.includes('atGridFloor'))
        assert.ok(new Set(['checkStratumCoverage']).isSubsetOf(new Set(decision.actions)))
    })

    // Unstratified spacing is analytical, so it may still be reduced below a raster floor.
    it('still suggests smaller analytical distances for unstratified systematic', () => {
        assert.ok(
            nextDenserMinDistance({minDistance: 60, pixelSize: 30, unstratified: true}) < 60
        )
    })
})

describe('unstratified advice never mentions stratification, merging, or Equal allocation', () => {
    const UNSTRATIFIED_SYS = {...SYSTEMATIC, unstratified: true}
    const UNSTRATIFIED_RANDOM = {...RANDOM, unstratified: true}
    const aoiStratum = (actual, sampleSize = 100) => ({counts: {1: actual}, allocation: [{stratum: 1, label: 'Area of interest', sampleSize}]})

    it('uses enlargeAoi instead of the stratum-coverage action for statistical-minimum failures', () => {
        const sys = decisionsFor({...aoiStratum(1), ...UNSTRATIFIED_SYS})[0]
        assert.deepEqual(
            sys.actions,
            ['reduceSystematicMinDistance', 'switchToRandom', 'enlargeAoi']
        )
        assert.ok(!sys.actions.includes('checkStratumCoverage'))
        const rand = decisionsFor({...aoiStratum(1), ...UNSTRATIFIED_RANDOM})[0]
        assert.deepEqual(rand.actions, ['enlargeAoi'])
    })

    it('never recommends changing Equal allocation for an unstratified requested-count shortfall', () => {
        const decision = decisionsFor({...aoiStratum(25), effectiveMinimum: 10, allocationStrategy: 'EQUAL', ...UNSTRATIFIED_RANDOM})[0]
        assert.ok(!decision.actions.includes('avoidEqualAllocation'))
        assert.deepEqual(decision.actions, ['reduceRequested'])
    })

    it('renders no stratification, merge, or Equal-allocation wording for an unstratified failure', () => {
        const config = {effectiveMinimum: 10, allocationStrategy: 'EQUAL', ...UNSTRATIFIED_SYS}
        const allocation = [{stratum: 1, label: 'Area of interest', sampleSize: 100}]
        const failures = classifyFinalCounts({counts: {1: 25}, allocation, ...config})
        const text = renderAdvice(underproductionAdvice({groups: groupFinalCountFailures(failures), config}))
        assert.doesNotMatch(text, /stratification/i)
        assert.doesNotMatch(text, /merge/i)
        assert.doesNotMatch(text, /equal allocation/i)
    })
})

describe('stratum terminology and action limits', () => {
    const threeStrata = () => [
        {stratum: 1, label: 'snow', sampleSize: 100},
        {stratum: 2, label: 'water', sampleSize: 100},
        {stratum: 3, label: 'crops', sampleSize: 100}
    ]

    it('uses stratum, not class, in rendered diagnoses and actions', () => {
        const config = {effectiveMinimum: 10, ...SYSTEMATIC}
        const failures = classifyFinalCounts({counts: {1: 1, 2: 7, 3: 25}, allocation: threeStrata(), ...config})
        const text = renderAdvice(underproductionAdvice({groups: groupFinalCountFailures(failures), config}))
        assert.doesNotMatch(text, /\bclass(es)?\b/i)
        assert.match(text, /stratum|strata/)
    })

    it('never emits more than three actions in any diagnosis group, across configurations', () => {
        const configs = [
            {...SYSTEMATIC}, {...SYSTEMATIC, sampleSizeStrategy: 'EXACT'}, {...RANDOM},
            {...SYSTEMATIC, unstratified: true}, {...RANDOM, unstratified: true},
            {...SYSTEMATIC, allocationStrategy: 'EQUAL'},
            {...SYSTEMATIC, allocationStrategy: 'EQUAL', estimateSampleSize: true},
            {...RANDOM, estimateSampleSize: true}
        ]
        for (const config of configs) {
            const failures = classifyFinalCounts({counts: {1: 1, 2: 7, 3: 25}, allocation: threeStrata(), effectiveMinimum: 10, ...config})
            const groups = underproductionAdvice({groups: groupFinalCountFailures(failures), config: {effectiveMinimum: 10, ...config}})
            for (const group of groups) {
                assert.ok(group.actions.length <= 3)
            }
        }
    })
})

describe('Manual allocation ignores stale saved Samples/Error and Equal flags', () => {
    // Manual is saved as a boolean or as the old form-toggle array; both `true` and `[true]` are Manual.
    for (const manual of [true, [true]]) {
        it(`treats manual=${JSON.stringify(manual)} as an active mode: per-stratum count advice, no Equal advice`, () => {
            const [decision] = decisionsFor({
                ...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC,
                manual, estimateSampleSize: true, allocationStrategy: 'EQUAL'
            })
            assert.equal(decision.kind, 'requestedAllocation')
            assert.equal(decision.diagnosis, 'diagnosis.requestedAllocation')
            assert.ok(decision.actions.includes('reduceRequestedManualOrClosest'))
            assert.ok(!decision.actions.includes('increaseMarginOfErrorOrClosest'))
            assert.ok(!decision.actions.includes('avoidEqualAllocation'))
        })
    }

    // `false` and `[]` are NOT Manual, so the saved Error/EQUAL flags are honored.
    for (const manual of [false, []]) {
        it(`treats manual=${JSON.stringify(manual)} as automatic: Error-mode and Equal advice apply`, () => {
            const [decision] = decisionsFor({
                ...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC,
                manual, estimateSampleSize: true, allocationStrategy: 'EQUAL'
            })
            assert.equal(decision.diagnosis, 'diagnosis.calculatedAllocation')
            assert.ok(decision.actions.includes('increaseMarginOfErrorOrClosest'))
            assert.ok(decision.actions.includes('avoidEqualAllocation'))
        })
    }
})
