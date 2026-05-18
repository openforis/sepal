const sharedRecipe = require('#sepal/recipe')

describe('AI module -> #sepal/recipe import', () => {

    it('resolves listRecipeSpecs / getRecipeSpec / validateRecipe', () => {
        expect(typeof sharedRecipe.listRecipeSpecs).toBe('function')
        expect(typeof sharedRecipe.getRecipeSpec).toBe('function')
        expect(typeof sharedRecipe.validateRecipe).toBe('function')
        expect(typeof sharedRecipe.getRecipeSchema).toBe('function')
        expect(typeof sharedRecipe.getRecipeDefaults).toBe('function')
    })

    it('returns MOSAIC from the registry', () => {
        const ids = sharedRecipe.listRecipeSpecs().map(spec => spec.id)

        expect(ids).toContain('MOSAIC')
    })

    it('validates a valid MOSAIC model end-to-end through the imported API', () => {
        const defaults = sharedRecipe.getRecipeDefaults('MOSAIC')
        const model = {
            ...defaults,
            aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
        }

        expect(sharedRecipe.validateRecipe('MOSAIC', model)).toEqual([])
    })
})
