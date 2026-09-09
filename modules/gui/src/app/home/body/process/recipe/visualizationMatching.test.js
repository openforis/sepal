import {describe, expect, it} from 'vitest'

import {
    findVisualization,
    renderableVisualizations,
    selectionState,
    visualizationsWithAvailableBands,
    withKnownIdentities
} from './visualizationMatching'

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

// What a direct renderer may be offered. The name rule keeps a style whose bands still exist; the physical
// rule keeps only the ones a renderer can actually draw.
describe('renderable visualizations', () => {
    const bands = {
        ndvi: {dataType: {arrayDimensions: 0}},
        segments: {dataType: {arrayDimensions: 1}},
        unknown: {}
    }

    it('keeps a style over a scalar band', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['ndvi']}], bands).map(({id}) => id)).toEqual(['a'])
    })

    it('drops a style over an array band, though the band exists', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['segments']}], bands)).toEqual([])
    })

    it('drops a style that mixes a scalar band with an array one', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['ndvi', 'segments']}], bands)).toEqual([])
    })

    it('drops a style naming a band that is gone', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['removed']}], bands)).toEqual([])
    })

    // Never observed is not the same as scalar, and guessing either way would be inventing evidence.
    it('keeps a style over a band whose type was never observed', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['unknown']}], bands).map(({id}) => id)).toEqual(['a'])
    })

    it('keeps everything when nothing is known about any band', () => {
        expect(renderableVisualizations([{id: 'a', bands: ['ndvi']}], {ndvi: {}}).map(({id}) => id)).toEqual(['a'])
    })
})

// Keeping the identity a style is already known by, so re-reading a source cannot orphan the selection
// naming it.
describe('known identities', () => {
    const known = [{id: 'saved-ndvi', bands: ['ndvi']}]

    it('gives an unidentified style the identity recorded for its bands', () => {
        expect(withKnownIdentities([{bands: ['ndvi'], palette: ['#000']}], known))
            .toEqual([{id: 'saved-ndvi', bands: ['ndvi'], palette: ['#000']}])
    })

    it('replaces an identity generated by the read with the one already recorded', () => {
        expect(withKnownIdentities([{id: 'generated', bands: ['ndvi']}], known).map(({id}) => id))
            .toEqual(['saved-ndvi'])
    })

    it('takes the new definition while keeping that identity', () => {
        expect(withKnownIdentities([{id: 'generated', bands: ['ndvi'], palette: ['#fff']}], known))
            .toEqual([{id: 'saved-ndvi', bands: ['ndvi'], palette: ['#fff']}])
    })

    it('leaves a style over other bands with whatever identity it arrived with', () => {
        expect(withKnownIdentities([{id: 'generated', bands: ['red']}], known).map(({id}) => id))
            .toEqual(['generated'])
    })

    it('gives two styles over one band two identities rather than one twice', () => {
        const two = [{id: 'saved-a', bands: ['ndvi']}, {id: 'saved-b', bands: ['ndvi']}]

        expect(withKnownIdentities([{bands: ['ndvi']}, {bands: ['ndvi']}], two).map(({id}) => id))
            .toEqual(['saved-a', 'saved-b'])
    })

    // The failure this ordering exists to prevent: two styles over one band, one deleted upstream, the
    // survivor matching itself exactly rather than inheriting the deleted one's identity by position.
    it('does not hand a deleted style\'s identity to its surviving sibling', () => {
        const known = [
            {id: 'saved-a', bands: ['ndvi'], palette: ['#000']},
            {id: 'saved-b', bands: ['ndvi'], palette: ['#fff']}
        ]

        expect(withKnownIdentities([{id: 'generated', bands: ['ndvi'], palette: ['#fff']}], known))
            .toEqual([{id: 'saved-b', bands: ['ndvi'], palette: ['#fff']}])
    })

    it('keeps a genuine identity it has seen before, rather than reassigning by position', () => {
        const known = [
            {id: 'stable-a', bands: ['ndvi'], palette: ['#000']},
            {id: 'stable-b', bands: ['ndvi'], palette: ['#fff']}
        ]

        expect(withKnownIdentities([{id: 'stable-b', bands: ['ndvi'], palette: ['#eee']}], known).map(({id}) => id))
            .toEqual(['stable-b'])
    })

    it('leaves a style unidentified when nothing is recorded for it', () => {
        expect(withKnownIdentities([{bands: ['ndvi']}], [])).toEqual([{bands: ['ndvi']}])
    })
})
