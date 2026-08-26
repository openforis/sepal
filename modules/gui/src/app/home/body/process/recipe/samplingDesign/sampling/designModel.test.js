import {describe, expect, it} from 'vitest'

import {reconcileManualProportions, unansweredProportions} from './designModel'

// Manual proportions are rendered from their own rows, so a stratum with no row cannot be answered at all.
// When the strata move underneath them the Proportions panel reconciles the rows as it opens - Sync only
// flags the section, and never writes a proportion.

const design = (strata, anticipatedProportions) => ({
    stratification: {strata: strata.map(value => ({value}))},
    proportions: {anticipatedProportions}
})

const ANSWERED = [{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}]

describe('reconcileManualProportions', () => {
    it('keeps every answer with its stratum', () => {
        expect(reconcileManualProportions(design([1, 2], ANSWERED))).toEqual(ANSWERED)
    })

    // A blank the user must fill, not a zero that quietly claims they already did.
    it('leaves a new stratum unanswered rather than inventing a proportion', () => {
        expect(reconcileManualProportions(design([1, 2, 3], ANSWERED)))
            .toEqual([{stratum: 1, proportion: 0.4}, {stratum: 2, proportion: 0.1}, {stratum: 3}])
    })

    it('drops a stratum that no longer exists', () => {
        expect(reconcileManualProportions(design([2], ANSWERED))).toEqual([{stratum: 2, proportion: 0.1}])
    })

    // Keyed, not positional: a positional pass would slide stratum 2's answer onto stratum 3.
    it('matches by key when a stratum is dropped from the middle', () => {
        const answered = [{stratum: 1, proportion: 0.1}, {stratum: 2, proportion: 0.2}, {stratum: 3, proportion: 0.3}]
        expect(reconcileManualProportions(design([2, 3], answered)))
            .toEqual([{stratum: 2, proportion: 0.2}, {stratum: 3, proportion: 0.3}])
    })

    it('follows a reordering without moving an answer', () => {
        expect(reconcileManualProportions(design([2, 1], ANSWERED)))
            .toEqual([{stratum: 2, proportion: 0.1}, {stratum: 1, proportion: 0.4}])
    })

    it('carries no presentation, which the table joins from the stratification', () => {
        reconcileManualProportions(design([1, 2], ANSWERED))
            .forEach(row => expect(Object.keys(row).sort()).toEqual(['proportion', 'stratum']))
    })

    it('reconciles from nothing at all into a row per stratum', () => {
        expect(reconcileManualProportions(design([1, 2], undefined))).toEqual([{stratum: 1}, {stratum: 2}])
    })
})

// Only these justify asking a person for anything.
describe('unansweredProportions', () => {
    it('names the strata nobody has answered for', () => {
        expect(unansweredProportions(design([1, 2, 3], ANSWERED))).toEqual([3])
        expect(unansweredProportions(design([1, 2], ANSWERED))).toEqual([])
    })

    // Zero is an answer.
    it('treats a zero proportion as answered', () => {
        expect(unansweredProportions(design([1], [{stratum: 1, proportion: 0}]))).toEqual([])
    })
})
