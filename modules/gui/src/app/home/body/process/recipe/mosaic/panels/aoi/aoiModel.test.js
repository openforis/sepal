import {modelToValues, valuesToModel} from './aoiModel'

describe('aoi asset/recipe source mapping', () => {
    it('opens a saved ASSET model as the combined SOURCE section with ASSET selected', () => {
        expect(modelToValues({type: 'ASSET', id: 'projects/p/assets/x'})).toEqual({
            section: 'SOURCE',
            sourceType: 'ASSET',
            assetId: 'projects/p/assets/x'
        })
    })

    it('opens a saved RECIPE model as the combined SOURCE section with RECIPE selected (populating recipeId, not assetId)', () => {
        const values = modelToValues({type: 'RECIPE', id: 'recipe-123'})
        expect(values).toEqual({
            section: 'SOURCE',
            sourceType: 'RECIPE',
            recipeId: 'recipe-123'
        })
        expect(values.assetId).toBeUndefined()
    })

    it('round-trips ASSET source values back to an explicit ASSET model', () => {
        expect(valuesToModel({section: 'SOURCE', sourceType: 'ASSET', assetId: 'a1', recipeId: 'r1'}))
            .toEqual({type: 'ASSET', id: 'a1'})
    })

    it('round-trips RECIPE source values back to an explicit RECIPE model', () => {
        expect(valuesToModel({section: 'SOURCE', sourceType: 'RECIPE', assetId: 'a1', recipeId: 'r1'}))
            .toEqual({type: 'RECIPE', id: 'r1'})
    })

    it('throws rather than defaulting to ASSET when the source type is missing', () => {
        expect(() => valuesToModel({section: 'SOURCE', assetId: 'a1'})).toThrow()
    })
})
