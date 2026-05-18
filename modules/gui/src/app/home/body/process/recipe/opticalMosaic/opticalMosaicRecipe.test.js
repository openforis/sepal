import {getRecipeSpec, validateRecipe} from '#recipes'

describe('GUI -> #recipes shared import', () => {

    it('resolves the MOSAIC spec through the #recipes alias', () => {
        expect(getRecipeSpec('MOSAIC')).toMatchObject({id: 'MOSAIC'})
    })

    it('returns structured errors (not a throw) for an unknown id', () => {
        expect(validateRecipe('UNKNOWN', {})).toEqual([
            expect.objectContaining({rule: 'unknownType'})
        ])
    })
})
