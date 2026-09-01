import {describe, expect, it, vi} from 'vitest'

// The two conversions between the Masking input-image panel's form values and the recipe model. They are what
// runs when the panel is reopened on a saved recipe and applied again, so anything they drop is gone from the
// recipe - the visualizations copied from the source asset or recipe included.

// The panel builds its field descriptors at module load and the real `Form` barrel is not resolvable outside a
// mounted app. Only the fluent no-ops are needed; nothing here renders the panel.
vi.mock('~/widget/form', () => {
    class Field {
        notBlank() { return this }
        notEmpty() { return this }
        skip() { return this }
    }
    return {Form: {Field}}
})

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {modelToValues, valuesToModel} = await import('./inputImage')

const VISUALIZATIONS = [
    {id: 'v1', type: 'continuous', bands: ['ndvi'], min: [-10000], max: [10000]},
    {id: 'v2', type: 'rgb', bands: ['red', 'green', 'blue']}
]

const assetModel = (visualizations = VISUALIZATIONS) => ({
    type: 'ASSET',
    id: 'users/me/my-asset',
    bands: ['red', 'green', 'blue', 'ndvi'],
    visualizations
})

const recipeModel = (visualizations = VISUALIZATIONS) => ({
    type: 'RECIPE_REF',
    id: 'recipe-1',
    bands: ['red', 'green', 'blue', 'ndvi'],
    visualizations
})

describe('reopening the panel on a saved recipe', () => {
    it('restores the visualizations of an asset source', () => {
        expect(modelToValues(assetModel()).visualizations).toBe(VISUALIZATIONS)
    })

    it('restores the visualizations of a recipe source', () => {
        expect(modelToValues(recipeModel()).visualizations).toBe(VISUALIZATIONS)
    })

    it('restores the rest of the asset selection alongside them', () => {
        expect(modelToValues(assetModel())).toMatchObject({
            section: 'ASSET',
            asset: 'users/me/my-asset',
            bands: ['red', 'green', 'blue', 'ndvi']
        })
    })

    it('restores the rest of the recipe selection alongside them', () => {
        expect(modelToValues(recipeModel())).toMatchObject({
            section: 'RECIPE_REF',
            recipe: 'recipe-1'
        })
    })

    // The form field is named `visualizations`, so a value under any other key never reaches it.
    it('puts them under no other key', () => {
        expect(Object.keys(modelToValues(assetModel()))).not.toContain('visualiations')
    })
})

describe('applying the panel again', () => {
    it('writes back the very same visualization array for an asset source', () => {
        const model = assetModel()

        expect(valuesToModel(modelToValues(model)).visualizations).toBe(model.visualizations)
    })

    it('writes back the very same visualization array for a recipe source', () => {
        const model = recipeModel()

        expect(valuesToModel(modelToValues(model)).visualizations).toBe(model.visualizations)
    })

    it('returns the whole model unchanged through a round trip', () => {
        const model = assetModel()

        expect(valuesToModel(modelToValues(model))).toEqual(model)
    })
})

describe('sources with nothing to restore', () => {
    it('keeps an empty list empty rather than dropping it', () => {
        const visualizations = []

        expect(valuesToModel(modelToValues(assetModel(visualizations))).visualizations).toBe(visualizations)
    })

    it('invents nothing when the model has no visualizations at all', () => {
        const {visualizations: _visualizations, ...model} = assetModel()

        expect(modelToValues(model).visualizations).toBeUndefined()
        expect(valuesToModel(modelToValues(model)).visualizations).toBeUndefined()
    })

    it('reports an unselected section without a model', () => {
        expect(modelToValues({}).section).toBe('SELECTION')
        expect(valuesToModel({section: 'SELECTION'})).toBe(null)
    })
})
