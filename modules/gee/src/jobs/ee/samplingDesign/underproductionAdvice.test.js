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
        expect(nextDenserMinDistance({minDistance: 60, pixelSize: 10})).toBeCloseTo(55.4, 1)
    })

    it('returns null when the grid already imposes the closest spacing', () => {
        expect(nextDenserMinDistance({minDistance: 20, pixelSize: 10})).toBeNull()
        expect(nextDenserMinDistance({minDistance: 60, pixelSize: 30})).toBeNull()
    })

    it('uses the min-distance-only contract for analytical unstratified systematic sampling', () => {
        // A 30 m grid would floor a stratified lattice at 60 m, but unstratified spacing is distance-only.
        expect(nextDenserMinDistance({minDistance: 60, pixelSize: 30, unstratified: true})).toBeCloseTo(55.4, 1)
        expect(nextDenserMinDistance({minDistance: 0, pixelSize: 30, unstratified: true})).toBeNull()
    })
})

describe('statisticalMinimum advice', () => {
    it('offers spacing, Random, and class actions for systematic, with the calculated threshold', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC})
        expect(decision.kind).toBe('statisticalMinimum')
        expect(decision.diagnosis).toBe('diagnosis.statisticalMinimum')
        expect(decision.diagnosisArgs).toMatchObject({strata: 'snow (1)', minimum: 2})
        expect(decision.actions).toEqual([
            'reduceSystematicMinDistance', 'switchToRandom', 'reviseStratification', 'enlargeOrMerge'
        ])
        expect(decision.actionArgs.reduceSystematicMinDistance).toEqual({minDistance: 60, threshold: 55.4})
    })

    it('replaces the reduce-distance action with the grid floor when spacing cannot help', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...SYSTEMATIC, minDistance: 20})
        expect(decision.actions).toContain('atGridFloor')
        expect(decision.actions).not.toContain('reduceSystematicMinDistance')
        expect(decision.actionArgs.atGridFloor).toEqual({pixelSize: 10})
    })

    it('does not offer Random when arrangement is already Random', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...RANDOM, minDistance: 60})
        expect(decision.actions).toEqual(['reduceRandomMinDistance', 'reviseStratification', 'enlargeOrMerge'])
        expect(decision.actionArgs.reduceRandomMinDistance).toEqual({minDistance: 60})
    })

    it('gives only class/AOI actions for random without a distance, and blames the class only then', () => {
        const [decision] = decisionsFor({...oneStratum(1), ...RANDOM})
        expect(decision.diagnosis).toBe('diagnosis.statisticalMinimumNoDistance')
        expect(decision.actions).toEqual(['reviseStratification', 'enlargeOrMerge'])
        expect(decision.actions).not.toContain('lowerConfiguredMinimum')
    })

    it('names every failing class with its own count', () => {
        const [decision] = decisionsFor({
            counts: {1: 0, 2: 1},
            allocation: [{stratum: 1, label: 'snow', sampleSize: 100}, {stratum: 2, label: 'water', sampleSize: 100}],
            ...SYSTEMATIC
        })
        expect(decision.diagnosisArgs.strata).toBe('snow (0); water (1)')
    })
})

describe('configuredMinimum advice', () => {
    it('names the value the minimum could be lowered to, and its floor', () => {
        const [decision] = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC, sampleSizeStrategy: 'CLOSEST'})
        expect(decision.kind).toBe('configuredMinimum')
        expect(decision.actionArgs.lowerConfiguredMinimum).toEqual({value: 7, floor: 2})
        expect(decision.actions).not.toContain('minimumNotSufficient')
    })

    it('warns that lowering the minimum is insufficient when the request is also unmet', () => {
        const [decision] = decisionsFor({...oneStratum(7), effectiveMinimum: 10, ...SYSTEMATIC})
        expect(decision.actions).toContain('minimumNotSufficient')
    })
})

describe('requestedAllocation advice', () => {
    it('offers Closest for systematic OVER/EXACT', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC})
        expect(decision.kind).toBe('requestedAllocation')
        expect(decision.diagnosisArgs).toMatchObject({strata: 'snow (25 of 100)', minimum: 10})
        expect(decision.actions).toContain('reduceRequestedOrClosest')
    })

    it('offers a random-specific reduce action, never Closest, for random sampling', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...RANDOM})
        expect(decision.actions).toContain('reduceRequestedRandom')
        expect(decision.actions).not.toContain('reduceRequestedOrClosest')
    })

    it('always recommends something for random with no distance and non-equal allocation', () => {
        const [decision] = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'PROPORTIONAL', ...RANDOM})
        expect(decision.actions.length).toBeGreaterThan(0)
        expect(decision.actions).toEqual(['reduceRequestedRandom'])
    })

    it('recommends a non-EQUAL strategy only when allocation is EQUAL', () => {
        const equal = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'EQUAL', ...SYSTEMATIC})
        expect(equal[0].actions).toContain('avoidEqualAllocation')
        const proportional = decisionsFor({...oneStratum(25), effectiveMinimum: 10, allocationStrategy: 'PROPORTIONAL', ...SYSTEMATIC})
        expect(proportional[0].actions).not.toContain('avoidEqualAllocation')
    })

    it('drops CLOSEST out of requestedAllocation entirely (undershoot is allowed)', () => {
        expect(decisionsFor({...oneStratum(25), effectiveMinimum: 10, ...SYSTEMATIC, sampleSizeStrategy: 'CLOSEST'}))
            .toEqual([])
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
        expect(key).toBe(`${KEY}.message`)
        expect(args.advice.map(({kind}) => kind)).toEqual(['statisticalMinimum', 'configuredMinimum', 'requestedAllocation'])
        // Every sentence is addressable by key, so a renderer can translate it.
        expect(args.advice.every(({diagnosis, actions}) =>
            diagnosis.key.startsWith(KEY) && actions.every(({key: actionKey}) => actionKey.startsWith(KEY)))).toBe(true)
    })

    // One focused check that the English fallback interpolates its arguments.
    it('renders an English fallback with arguments interpolated', () => {
        const config = {effectiveMinimum: 2, ...SYSTEMATIC}
        const failures = classifyFinalCounts({...oneStratum(1), ...config})
        const {args} = underproductionUserMessage({groups: groupFinalCountFailures(failures), config})
        expect(args.details).toContain('snow (1)')
        expect(args.details).toContain('55.4')
        expect(args.details).not.toContain('{')
        expect(renderAdvice([])).toBe('')
    })
})
