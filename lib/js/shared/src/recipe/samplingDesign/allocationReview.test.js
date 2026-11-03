import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {allocationReviewInputs, allocationReviewState} from './allocationReview.js'

// Whether a design's allocation was reviewed for the inputs it reads now: the record Apply saves beside it compared with
// what the design's allocation reads. States are literals.

describe('an allocation applied with what it was reviewed for', () => {
    it('stays reviewed through a JSON round trip, and through the numbers form strings stand for', () => {
        const typed = reviewed(design({sampleAllocation: {sampleSize: '100', minSamplesPerStratum: '5', confidenceLevel: '95'}}))
        const numbers = withAllocation(typed, {sampleSize: 100, minSamplesPerStratum: 5, confidenceLevel: 95})

        assert.equal(allocationReviewState(JSON.parse(JSON.stringify(typed))), 'REVIEWED')
        assert.equal(allocationReviewState(numbers), 'REVIEWED')
    })

    it('stays reviewed through labels and colours the strata are given', () => {
        const saved = reviewed(design())

        assert.equal(allocationReviewState(withStrata(saved, strata => strata.map(stratum => ({...stratum, label: 'Renamed', color: '#ffffff'})))), 'REVIEWED')
    })

    it('is no longer reviewed once the strata are reordered, which remainder adjustment walks in order', () => {
        const saved = reviewed(design())

        assert.equal(allocationReviewState(withStrata(saved, strata => [...strata].reverse())), 'INPUTS_CHANGED')
    })

    it('is reviewed again once inputs that changed are back to what it was reviewed for', () => {
        const saved = reviewed(design())
        const changed = withAllocation(saved, {sampleSize: 200})

        assert.equal(allocationReviewState(changed), 'INPUTS_CHANGED')
        assert.equal(allocationReviewState(withAllocation(changed, {sampleSize: saved.sampleAllocation.sampleSize})), 'REVIEWED')
    })
})

describe('the weights an allocation reads', () => {
    for (const [name, sampleAllocation, proportions, reads] of [
        ['are those a strategy spreads by', {allocationStrategy: 'PROPORTIONAL'}, false, true],
        ['are none for Equal counts without proportions to show an uncertainty over', {allocationStrategy: 'EQUAL'}, false, false],
        ['are those the uncertainty reads, whatever the strategy', {allocationStrategy: 'EQUAL'}, true, true],
        ['are those the uncertainty of manual counts reads', {manual: [true]}, true, true],
        ['are none for manual counts without an uncertainty', {manual: [true]}, false, false]
    ]) {
        it(name, () => {
            const saved = reviewed(design({sampleAllocation, proportions}))

            assert.equal(allocationReviewState(withStrata(saved, reweighed)), reads ? 'INPUTS_CHANGED' : 'REVIEWED')
        })
    }
})

describe('the proportions an allocation reads', () => {
    it('are those anticipated, whatever the strategy', () => {
        const saved = reviewed(design({sampleAllocation: {allocationStrategy: 'EQUAL'}, proportions: true}))

        assert.equal(allocationReviewState(withProportions(saved, [{stratum: 1, proportion: 0.9}, {stratum: 2, proportion: 0.2}])), 'INPUTS_CHANGED')
    })

    it('are none once proportions are skipped, whatever rows the section still holds', () => {
        const saved = reviewed(design({proportions: true, skip: true}))

        assert.equal(allocationReviewState(withProportions(saved, [{stratum: 1, proportion: 0.9}, {stratum: 2, proportion: 0.2}])), 'REVIEWED')
    })
})

describe('the settings an allocation reads', () => {
    for (const [name, sampleAllocation, edit, reads] of [
        ['are the total sample size it spreads', {}, {sampleSize: 120}, true],
        ['are not a margin of error it shows rather than solves for', {}, {marginOfError: 7}, false],
        ['are the margin of error a total is solved for', {estimateSampleSize: true}, {marginOfError: 7}, true],
        ['are not the total solved for that margin', {estimateSampleSize: true}, {sampleSize: 999}, false],
        ['are the tuning constant of Power allocation', {allocationStrategy: 'POWER'}, {powerTuningConstant: 0.8}, true],
        ['are not a tuning constant another strategy leaves dormant', {allocationStrategy: 'OPTIMAL'}, {powerTuningConstant: 0.8}, false],
        ['are not a minimum Equal allocation does not configure', {allocationStrategy: 'EQUAL'}, {minSamplesPerStratum: 9}, false],
        ['are the confidence level of the uncertainty shown', {}, {confidenceLevel: 90}, true]
    ]) {
        it(name, () => {
            const saved = reviewed(design({sampleAllocation, proportions: true}))

            assert.equal(allocationReviewState(withAllocation(saved, edit)), reads ? 'INPUTS_CHANGED' : 'REVIEWED')
        })
    }
})

// Skip is saved as a boolean or as the form's toggle.
describe('proportions, however their skip was saved', () => {
    for (const [name, skips, read] of [
        ['are read where not skipped, as false, an empty toggle or absent alike', [false, [], undefined], true],
        ['are not read where skipped, as true or a set toggle alike', [true, [true]], false]
    ]) {
        it(name, () => {
            const [first, ...rest] = skips.map(skip => allocationReviewInputs(withSkip(design({proportions: true}), skip)))

            rest.forEach(inputs => assert.deepEqual(inputs, first))
            assert.equal(first.proportions !== null, read)
        })
    }
})

describe('manual counts', () => {
    it('are read where they determine the uncertainty shown', () => {
        const saved = reviewed(design({sampleAllocation: {manual: [true]}, proportions: true}))

        assert.equal(allocationReviewState(withAllocation(saved, {allocation: [{stratum: 1, sampleSize: 31}, {stratum: 2, sampleSize: 20}]})), 'INPUTS_CHANGED')
    })

    it('are not read where nothing is derived from them', () => {
        const saved = reviewed(design({sampleAllocation: {manual: [true]}}))

        assert.equal(allocationReviewState(withAllocation(saved, {allocation: [{stratum: 1, sampleSize: 31}, {stratum: 2, sampleSize: 20}]})), 'REVIEWED')
    })

    it('saved as the boolean flag are read as the toggle\'s are', () => {
        const toggled = design({sampleAllocation: {manual: [true]}, proportions: true})

        assert.deepEqual(allocationReviewInputs(withAllocation(toggled, {manual: true})), allocationReviewInputs(toggled))
    })
})

describe('an allocation without a trustworthy record', () => {
    it('saved without one, is unreviewed', () => {
        assert.equal(allocationReviewState(design()), 'UNREVIEWED')
    })

    for (const flag of [false, true]) {
        it(`is untrusted beside the flag a client of the previous release saved, ${flag}, though the record reads as the design does`, () => {
            const saved = reviewed(design())

            assert.equal(allocationReviewState(withAllocation(saved, {requiresUpdate: flag})), 'UNTRUSTED')
        })
    }

    it('is untrusted once an older client replaced the counts over changed inputs that later changed back', () => {
        const saved = reviewed(design())
        const replacedByOlderClient = withAllocation(saved, {sampleSize: 200, allocation: [{stratum: 1, sampleSize: 100}, {stratum: 2, sampleSize: 100}], requiresUpdate: false})

        assert.equal(allocationReviewState(withAllocation(replacedByOlderClient, {sampleSize: saved.sampleAllocation.sampleSize})), 'UNTRUSTED')
    })
})

// A stratified design with two strata and an automatic Optimal allocation of a fixed total, its proportions anticipated
// where asked for.
const design = ({sampleAllocation = {}, proportions = false, skip = false} = {}) => ({
    stratification: {
        strata: [
            {value: 1, label: 'Forest', color: '#00aa00', area: 600, weight: 0.6},
            {value: 2, label: 'Water', color: '#0000aa', area: 400, weight: 0.4}
        ]
    },
    proportions: proportions
        ? {skip, anticipatedProportions: [{stratum: 1, proportion: 0.1}, {stratum: 2, proportion: 0.2}]}
        : {skip: true},
    sampleAllocation: {
        manual: [], estimateSampleSize: false, allocationStrategy: 'OPTIMAL', sampleSize: 100, marginOfError: 10,
        confidenceLevel: 95, minSamplesPerStratum: 2, powerTuningConstant: 0.5,
        allocation: [{stratum: 1, sampleSize: 60}, {stratum: 2, sampleSize: 40}],
        ...sampleAllocation
    }
})

const reviewed = model => withAllocation(model, {reviewedInputs: allocationReviewInputs(model)})

const withAllocation = (model, changes) => ({...model, sampleAllocation: {...model.sampleAllocation, ...changes}})

const withStrata = (model, change) => ({...model, stratification: {...model.stratification, strata: change(model.stratification.strata)}})

const withProportions = (model, anticipatedProportions) => ({...model, proportions: {...model.proportions, anticipatedProportions}})

const withSkip = (model, skip) => {
    const {skip: _skip, ...proportions} = model.proportions
    return {...model, proportions: skip === undefined ? proportions : {...proportions, skip}}
}

const reweighed = strata => strata.map((stratum, index) => ({...stratum, weight: index ? 0.3 : 0.7}))
