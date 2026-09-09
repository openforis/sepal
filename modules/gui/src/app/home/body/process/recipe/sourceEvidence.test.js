import {describe, expect, it} from 'vitest'

import {currentSourceEvidence, declaredSelections, inheritedSourceKey, sourceEvidenceOr} from './sourceEvidence'

// Which answer a consumer gets about a Masking recipe's bands and presets: what was observed of the source
// it currently selects, or - only while nothing has been observed - the snapshot copied into the model when
// the source was chosen.

const SAVED_NDVI = {id: 'saved-ndvi', bands: ['ndvi'], type: 'continuous', palette: ['#000', '#fff']}

const SNAPSHOT = {
    type: 'RECIPE_REF',
    id: 'ccdc-1',
    bands: ['red', 'nir', 'ndvi'],
    visualizations: [SAVED_NDVI]
}

const scalar = names => names.map(name => ({name, dataType: {arrayDimensions: 0}}))

const observation = ({bands = scalar(['red', 'nir']), visualizations = [], status = 'OBSERVED'} = {}) =>
    ({sourceKey: 'RECIPE_REF:ccdc-1', status, bands, visualizations})

const recipeOf = ({primary = SNAPSHOT, sourceEvidence} = {}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: primary},
    ...(sourceEvidence ? {ui: {sourceEvidence}} : {})
})

const evidenceOf = recipe => sourceEvidenceOr(recipe, recipe.model.imageToMask)

describe('the source evidence key', () => {
    it('names the currently selected primary source', () => {
        expect(inheritedSourceKey(recipeOf())).toBe('RECIPE_REF:ccdc-1')
    })

    it('distinguishes an asset from a recipe of the same id', () => {
        expect(inheritedSourceKey(recipeOf({primary: {type: 'ASSET', id: 'ccdc-1'}}))).toBe('ASSET:ccdc-1')
    })

    it('is absent when no primary source is selected', () => {
        expect(inheritedSourceKey({id: 'masked-1', type: 'MASKING', model: {}})).toBeNull()
    })
})

// Every declared source, because what can be answered depends on the whole closure: a mask that was missing
// and has been replaced is as much a reason to look again as the primary image changing. An observer watches
// them without having to know that Masking calls its inputs `imageToMask` and `imageMask`.
describe('the declared selections', () => {
    it('are the model fields the declaration points at', () => {
        const mask = {type: 'RECIPE_REF', id: 'forest-mask'}
        const recipe = {id: 'masked-1', type: 'MASKING', model: {imageToMask: SNAPSHOT, imageMask: mask}}

        expect(declaredSelections(recipe)).toEqual([SNAPSHOT, mask])
    })

    it('are empty for a recipe with nothing selected', () => {
        expect(declaredSelections({id: 'masked-1', type: 'MASKING', model: {}})).toEqual([])
    })
})

describe('a recipe with evidence for the source it selects', () => {
    const recipe = recipeOf({sourceEvidence: observation()})

    it('reports the observed bands, not the copied ones', () => {
        expect(evidenceOf(recipe).bands.map(({name}) => name)).toEqual(['red', 'nir'])
    })

    it('reports that the answer was observed', () => {
        expect(evidenceOf(recipe).availability).toBe('OBSERVED')
    })
})

describe('a recipe with nothing observed yet', () => {
    const recipe = recipeOf()

    it('falls back to the copied snapshot rather than reporting no bands', () => {
        expect(evidenceOf(recipe).bands).toEqual([{name: 'red'}, {name: 'nir'}, {name: 'ndvi'}])
        expect(evidenceOf(recipe).visualizations).toEqual([SAVED_NDVI])
    })

    it('says the source has not been observed', () => {
        expect(evidenceOf(recipe).availability).toBe('UNOBSERVED')
    })

    it('claims no dimensionality it has not observed', () => {
        expect(evidenceOf(recipe).bands.every(({dataType}) => dataType === undefined)).toBe(true)
    })
})

// A source that could not be reached is not a source whose saved bands are current. Presenting them would
// assert a schema nothing verified; withholding takes the layer off the map and blocks export instead.
describe('a source that could not be observed', () => {
    const recipe = recipeOf({sourceEvidence: observation({status: 'UNAVAILABLE', bands: [], visualizations: []})})

    it('offers no bands, rather than the ones the recipe remembers', () => {
        expect(evidenceOf(recipe).bands).toEqual([])
    })

    it('offers no presets either', () => {
        expect(evidenceOf(recipe).visualizations).toEqual([])
    })

    it('says so, so a consumer can tell it apart from an unobserved source', () => {
        expect(evidenceOf(recipe).availability).toBe('UNAVAILABLE')
    })
})

// Observing an asset parses its presets out of its properties again, with no identity of their own. A saved
// selection matches by id, so handing back unidentified copies of unchanged presets would make every
// selection stale on the first refresh - and take the layer off the map for a source that never changed.
describe('re-observing a source whose presets are unchanged', () => {
    const observed = {bands: ['ndvi'], type: 'continuous', palette: ['#000', '#fff']}
    const recipe = recipeOf({
        sourceEvidence: observation({bands: scalar(['ndvi']), visualizations: [observed]})
    })

    it('keeps the identity the recipe already knows the preset by', () => {
        expect(evidenceOf(recipe).visualizations).toEqual([{...observed, id: 'saved-ndvi'}])
    })

    it('takes an upstream restyle while keeping that identity, so the map follows the change', () => {
        const restyled = {bands: ['ndvi'], type: 'continuous', palette: ['#111', '#222']}
        const withRestyle = recipeOf({
            sourceEvidence: observation({bands: scalar(['ndvi']), visualizations: [restyled]})
        })

        expect(evidenceOf(withRestyle).visualizations).toEqual([{...restyled, id: 'saved-ndvi'}])
    })

    it('leaves a preset the recipe has never seen unidentified', () => {
        const added = {bands: ['nir'], type: 'continuous'}
        const withAdded = recipeOf({
            sourceEvidence: observation({bands: scalar(['nir']), visualizations: [added]})
        })

        expect(evidenceOf(withAdded).visualizations).toEqual([added])
    })

    it('gives two presets over the same band two different identities', () => {
        const first = {bands: ['ndvi'], type: 'continuous', palette: ['#000']}
        const second = {bands: ['ndvi'], type: 'continuous', palette: ['#fff']}
        const known = {
            ...SNAPSHOT,
            visualizations: [{...first, id: 'saved-a'}, {...second, id: 'saved-b'}]
        }
        const recipe = recipeOf({
            primary: known,
            sourceEvidence: observation({bands: scalar(['ndvi']), visualizations: [first, second]})
        })

        expect(sourceEvidenceOr(recipe, known).visualizations.map(({id}) => id))
            .toEqual(['saved-a', 'saved-b'])
    })

    it('does not take an identity from a preset over different bands', () => {
        const other = {bands: ['red'], type: 'continuous'}
        const withOther = recipeOf({
            sourceEvidence: observation({bands: scalar(['red']), visualizations: [other]})
        })

        expect(evidenceOf(withOther).visualizations[0].id).toBeUndefined()
    })
})

// Dimensionality is carried, not acted on: what may be drawn is decided where candidates are built, and
// what may be exported is a different question with a different answer.
describe('a source with array-valued bands', () => {
    const SEGMENTS = [
        {name: 'ndvi_rmse', dataType: {arrayDimensions: 1}},
        {name: 'changeProb', dataType: {arrayDimensions: 0}}
    ]

    it('reports each band with the dimensionality that was observed of it', () => {
        const recipe = recipeOf({sourceEvidence: observation({bands: SEGMENTS, visualizations: []})})

        expect(evidenceOf(recipe).bands).toEqual(SEGMENTS)
    })
})

describe('a recipe whose selection has moved on from its evidence', () => {
    it('does not answer with the previous source evidence', () => {
        const recipe = recipeOf({
            primary: {...SNAPSHOT, id: 'ccdc-2', bands: ['swir'], visualizations: []},
            sourceEvidence: observation()
        })

        expect(currentSourceEvidence(recipe)).toBeNull()
        expect(evidenceOf(recipe).bands).toEqual([{name: 'swir'}])
    })

    it('does not answer with it when the source changed from a recipe to an asset of the same id', () => {
        const asAsset = recipeOf({
            primary: {type: 'ASSET', id: 'ccdc-1', bands: ['swir']},
            sourceEvidence: observation()
        })

        expect(currentSourceEvidence(asAsset)).toBeNull()
    })
})

describe('a recipe that inherits no schema', () => {
    it('is answered from its snapshot argument alone', () => {
        const ccdc = {id: 'ccdc-1', type: 'CCDC', model: {}, ui: {sourceEvidence: observation()}}

        expect(currentSourceEvidence(ccdc)).toBeNull()
        expect(sourceEvidenceOr(ccdc, undefined).bands).toEqual([])
    })
})
