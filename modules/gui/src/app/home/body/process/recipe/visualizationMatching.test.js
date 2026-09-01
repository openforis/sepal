import {describe, expect, it} from 'vitest'

import {findVisualization, selectionState, visualizationsWithAvailableBands} from './visualizationMatching'

// The matching rule as it exists today, pinned before it is shared by a second caller. Identified
// visualizations match by id; preset visualizations have no id and match by their exact band list.

const userDefined = (id, bands) => ({id, bands})
const preset = bands => ({bands})

describe('findVisualization', () => {
    it('matches an identified visualization by id, whatever its bands now are', () => {
        const current = userDefined('v1', ['ndvi'])
        expect(findVisualization([current], {id: 'v1', bands: ['something-else']})).toBe(current)
    })

    it('does not match a different id', () => {
        const current = userDefined('v1', ['ndvi'])
        expect(findVisualization([current], {id: 'v1', bands: ['ndvi']})).toBe(current)
        expect(findVisualization([current], {id: 'v2', bands: ['ndvi']})).toBeUndefined()
    })

    it('matches an unidentified visualization by its exact band list', () => {
        const current = preset(['red', 'green', 'blue'])
        expect(findVisualization([current], {bands: ['red', 'green', 'blue']})).toBe(current)
        expect(findVisualization([current], {bands: ['red', 'green']})).toBeUndefined()
        expect(findVisualization([current], {bands: ['green', 'red', 'blue']})).toBeUndefined()
    })

    // An identified selection must not fall back to band matching, or renaming a user style's bands would
    // silently rebind the selection to an unrelated preset.
    it('never matches an identified selection against an unidentified visualization', () => {
        const identified = userDefined('v1', ['ndvi'])
        expect(findVisualization([identified, preset(['ndvi'])], {id: 'v1', bands: ['ndvi']})).toBe(identified)
        expect(findVisualization([preset(['ndvi'])], {id: 'v1', bands: ['ndvi']})).toBeUndefined()
    })

    // The other direction, and the one that would silently rebind a selection: choosing a source preset must not
    // land on a user style that happens to share its bands.
    it('never matches an unidentified selection against an identified visualization', () => {
        const identified = userDefined('v1', ['ndvi'])
        const unidentified = preset(['ndvi'])
        expect(findVisualization([identified], {bands: ['ndvi']})).toBeUndefined()
        expect(findVisualization([identified, unidentified], {bands: ['ndvi']})).toBe(unidentified)
    })

    it('matches nothing when there is no selection', () => {
        const current = preset(['ndvi'])
        expect(findVisualization([current], {bands: ['ndvi']})).toBe(current)
        expect(findVisualization([current], undefined)).toBeUndefined()
    })
})

describe('selectionState', () => {
    it.each([
        ['no candidates at all', [], {bands: ['ndvi']}, 'NO_CANDIDATES'],
        ['no candidates and no selection', [], undefined, 'NO_CANDIDATES'],
        ['candidates but nothing selected', [preset(['ndvi'])], undefined, 'UNSELECTED'],
        ['a selection that is still available', [preset(['ndvi'])], {bands: ['ndvi']}, 'MATCHED'],
        ['a selection that is no longer available', [preset(['ndvi'])], {bands: ['gone']}, 'STALE']
    ])('reports %s', (_name, visualizations, visParams, expected) => {
        expect(selectionState({visualizations, visParams})).toBe(expected)
    })
})

describe('visualizationsWithAvailableBands', () => {
    it('drops a visualization naming a band that no longer exists', () => {
        const valid = userDefined('valid', ['ndvi'])
        const stale = userDefined('stale', ['gone'])

        expect(visualizationsWithAvailableBands([valid, stale], ['ndvi', 'evi'])).toEqual([valid])
    })

    it('requires every band, not just the first', () => {
        const partly = preset(['ndvi', 'gone'])

        expect(visualizationsWithAvailableBands([partly], ['ndvi'])).toEqual([])
        expect(visualizationsWithAvailableBands([partly], ['ndvi', 'gone'])).toEqual([partly])
    })

    it('drops everything when nothing is available, and tolerates no visualizations', () => {
        expect(visualizationsWithAvailableBands([preset(['ndvi'])], [])).toEqual([])
        expect(visualizationsWithAvailableBands(undefined, ['ndvi'])).toEqual([])
    })
})
