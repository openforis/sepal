import {getRecipeSpec, validateRecipe} from '#sepal/recipe'

describe('GUI -> #sepal/recipe shared import', () => {

    it('resolves the MOSAIC spec through the #sepal/* alias', () => {
        expect(getRecipeSpec('MOSAIC')).toMatchObject({id: 'MOSAIC'})
    })

    it('returns structured errors (not a throw) for an unknown id', () => {
        expect(validateRecipe('UNKNOWN', {})).toEqual([
            expect.objectContaining({rule: 'unknownType'})
        ])
    })
})
